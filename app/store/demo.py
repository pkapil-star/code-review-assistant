"""Demo data for the dashboard.

Everything in this module is fabricated. It exists so the UI has something to
render before a real GitHub App installation starts producing reviews, and so
the pipeline can be demonstrated without a live webhook.

Two guard rails keep it honest:
  * every record it creates carries `is_demo=True`, and the UI labels those;
  * it is only loaded when DEMO_DATA is on, and it never overwrites a real
    record produced by the pipeline.

Delete this file and the `demo_data` setting once the service has a database
behind it; nothing else imports from here.
"""

from __future__ import annotations

from datetime import timedelta

from app.models.review import Severity
from app.store.memory import ReviewStore
from app.store.records import (
    DiffFile,
    DiffLine,
    Finding,
    FindingSource,
    PullRequestRecord,
    QualityMetrics,
    RULE_CATALOG,
    RepositoryRecord,
    ReviewStatus,
    utcnow,
)


def build_diff(path: str, language: str, patch: str, start_old: int, start_new: int) -> DiffFile:
    """Turn a compact patch string into a renderable diff file.

    The patch uses the usual unified-diff prefixes: "+" added, "-" removed, and
    a leading space for context.
    """
    lines: list[DiffLine] = []
    old_line = start_old
    new_line = start_new
    additions = 0
    deletions = 0

    for raw in patch.strip("\n").split("\n"):
        if raw.startswith("@@"):
            lines.append(DiffLine(kind="hunk", content=raw))
            continue

        prefix, content = raw[:1], raw[1:]

        if prefix == "+":
            lines.append(DiffLine(kind="add", new_line=new_line, content=content))
            new_line += 1
            additions += 1
        elif prefix == "-":
            lines.append(DiffLine(kind="remove", old_line=old_line, content=content))
            old_line += 1
            deletions += 1
        else:
            lines.append(
                DiffLine(kind="context", old_line=old_line, new_line=new_line, content=content)
            )
            old_line += 1
            new_line += 1

    return DiffFile(
        path=path,
        language=language,
        additions=additions,
        deletions=deletions,
        lines=lines,
    )


def finding(
    index: int,
    path: str,
    line: int | None,
    rule: str,
    message: str,
    source: FindingSource = FindingSource.STATIC,
    severity: Severity | None = None,
    snippet: str | None = None,
    title: str | None = None,
    why_it_matters: str | None = None,
    suggested_fix: str | None = None,
    category: str | None = None,
) -> Finding:
    """Build a demo finding, defaulting its wording from the real rule catalog."""
    meta = RULE_CATALOG.get(rule)

    return Finding(
        id=f"f{index}",
        path=path,
        line=line,
        severity=severity or (meta.default_severity if meta else Severity.INFO),
        rule=rule,
        title=title or (meta.title if meta else rule.replace("-", " ").title()),
        message=message,
        source=source,
        category=category or (meta.category if meta else "quality"),
        why_it_matters=why_it_matters or (meta.why_it_matters if meta else ""),
        suggested_fix=suggested_fix or (meta.suggested_fix if meta else ""),
        snippet=snippet,
    )


# --- the flagship pull request ------------------------------------------
# This is the record a demo walks through: it has a real-looking diff, findings
# from both layers, and a mix of severities.

PAYMENTS_DIFF = build_diff(
    "app/billing/charges.py",
    "python",
    """
@@ -18,9 +18,46 @@ class ChargeService:
     def __init__(self, gateway: PaymentGateway) -> None:
         self._gateway = gateway

-    def charge(self, customer_id, amount):
-        return self._gateway.charge(customer_id, amount)
+    STRIPE_KEY = "sk_live_51MxQ2ZKm4tRvB8nLpWfYgHjE7cD"
+
+    def charge(self, customer_id, amount, currency="usd", retries=3, metadata={}, idempotency_key=None):
+        print(f"charging {customer_id} {amount}")
+        metadata["attempted_at"] = time.time()
+
+        if currency is "usd":
+            amount = int(amount * 100)
+        elif currency == "eur":
+            amount = int(amount * 100 * self.fx_rate("eur"))
+        elif currency == "gbp":
+            amount = int(amount * 100 * self.fx_rate("gbp"))
+        elif currency == "inr":
+            amount = int(amount * 100 * self.fx_rate("inr"))
+        else:
+            raise ValueError("unsupported currency")
+
+        attempt = 0
+        while attempt < retries:
+            try:
+                result = self._gateway.charge(customer_id, amount, currency, key=self.STRIPE_KEY)
+                if result.status == "succeeded":
+                    self._ledger.record(customer_id, amount, currency, result.id, metadata, idempotency_key)
+                    return result
+                attempt += 1
+            except:
+                pass
+
+        # TODO: emit a metric here so we can alert on repeated gateway failures
+        return None
""",
    start_old=18,
    start_new=18,
)

LEDGER_DIFF = build_diff(
    "app/billing/ledger.py",
    "python",
    """
@@ -7,6 +7,17 @@ from app.billing.types import Entry

 class Ledger:
     \"\"\"Append-only record of every settled charge.\"\"\"
+
+    def record(self, customer_id, amount, currency, charge_id, metadata, idempotency_key):
+        entry = Entry(
+            customer_id=customer_id,
+            amount=amount,
+            currency=currency,
+            charge_id=charge_id,
+            metadata=metadata,
+        )
+        self._session.add(entry)
+        self._session.commit()
""",
    start_old=7,
    start_new=7,
)

GATEWAY_DIFF = build_diff(
    "app/billing/gateway.py",
    "python",
    """
@@ -22,8 +22,12 @@ class PaymentGateway:
     def charge(self, customer_id: str, amount: int, currency: str, key: str) -> ChargeResult:
         response = self._http.post(
             f"{self._base_url}/v1/charges",
-            headers={"Authorization": f"Bearer {self._key}"},
+            headers={"Authorization": f"Bearer {key}"},
             json={"customer": customer_id, "amount": amount, "currency": currency},
+            timeout=120,
         )

         return ChargeResult.from_response(response.json())
""",
    start_old=22,
    start_new=22,
)


def flagship_record() -> PullRequestRecord:
    """The pull request a live demo opens: rich diff, both review layers, mixed severities."""
    now = utcnow()

    findings = [
        finding(
            1,
            "app/billing/charges.py",
            22,
            "possible-secret",
            "A live Stripe secret key is hard-coded as a class attribute. This value will "
            "be readable by anyone with repository access and will remain in the git "
            "history after the line is deleted.",
            snippet='STRIPE_KEY = "sk_live_51MxQ2ZKm4tRvB8nLpWfYgHjE7cD"',
            suggested_fix=(
                "Read the key from settings and rotate the exposed one immediately:\n\n"
                "    STRIPE_KEY = settings.stripe_secret_key"
            ),
        ),
        finding(
            2,
            "app/billing/charges.py",
            24,
            "mutable-default-argument",
            "`metadata={}` is evaluated once when the function is defined, so every call "
            "that omits the argument shares the same dictionary. Line 26 then writes "
            "`attempted_at` into it, and that value leaks into the next charge.",
            snippet="def charge(self, customer_id, amount, currency=\"usd\", retries=3, metadata={}, ...)",
            suggested_fix=(
                "Default to None and build the dict per call:\n\n"
                "    def charge(self, ..., metadata=None, ...):\n"
                "        metadata = dict(metadata or {})"
            ),
        ),
        finding(
            3,
            "app/billing/charges.py",
            43,
            "bare-except",
            "`except:` with no exception type also catches KeyboardInterrupt and "
            "SystemExit, so a deployment that tries to stop this process during a retry "
            "loop will be ignored.",
            snippet="            except:",
            suggested_fix="Catch the gateway error you can actually retry: `except GatewayError:`",
        ),
        finding(
            4,
            "app/billing/charges.py",
            44,
            "silent-failure",
            "The except body is only `pass`. A failed charge attempt leaves no log line, "
            "so a customer reporting a missing payment gives support nothing to trace.",
            snippet="                pass",
            suggested_fix=(
                "Record the attempt before continuing:\n\n"
                "    except GatewayError as exc:\n"
                "        logger.warning(\"charge attempt %d failed: %s\", attempt, exc)"
            ),
        ),
        finding(
            5,
            "app/billing/charges.py",
            27,
            "identity-comparison",
            "`currency is \"usd\"` compares object identity, not value. CPython interns "
            "short literals so this passes in tests, but a currency string parsed from a "
            "request body is a different object and the branch silently stops matching.",
            snippet='        if currency is "usd":',
            suggested_fix='Use `==`: `if currency == "usd":`',
        ),
        finding(
            6,
            "app/billing/charges.py",
            24,
            "too-many-arguments",
            "`charge` now takes six parameters. Three of them are optional and two are "
            "strings, so a caller can transpose them without any error.",
            snippet=None,
            suggested_fix="Group currency, retries, metadata and idempotency_key into a ChargeOptions dataclass.",
        ),
        finding(
            7,
            "app/billing/charges.py",
            24,
            "high-complexity",
            "Cyclomatic complexity of `charge` is 12, against a limit of 10: five currency "
            "branches, a retry loop, a try/except and two status checks.",
            snippet=None,
            suggested_fix="Move the currency conversion into `_to_minor_units(amount, currency)` and the retry loop into `_charge_with_retries`.",
        ),
        finding(
            8,
            "app/billing/charges.py",
            25,
            "debug-leftover",
            "A `print` of the customer id and amount will reach production stdout, putting "
            "customer identifiers into logs that are not scoped for them.",
            snippet='        print(f"charging {customer_id} {amount}")',
            suggested_fix='Use the module logger at debug level, without the customer id.',
        ),
        finding(
            9,
            "app/billing/charges.py",
            47,
            "todo-added",
            "A TODO about alerting on repeated gateway failures is added with no owner "
            "and no linked issue.",
            snippet="        # TODO: emit a metric here so we can alert on repeated gateway failures",
            suggested_fix="Link the TODO to a tracked issue or implement the metric in this change.",
        ),
        finding(
            10,
            "app/billing/ledger.py",
            10,
            "missing-docstring",
            "`Ledger.record` is public and takes six positional parameters, but carries no "
            "docstring explaining what an entry means or when it is safe to call.",
            suggested_fix="Add a one-line docstring stating that the entry is append-only and committed immediately.",
        ),
        finding(
            11,
            "app/billing/charges.py",
            None,
            "missing-tests",
            "This pull request changes 3 source files (`app/billing/charges.py`, "
            "`app/billing/ledger.py`, `app/billing/gateway.py`) but adds or updates no "
            "test files.",
            suggested_fix="Add a test that charges in EUR and asserts the minor-unit conversion, plus one that asserts a failed attempt is retried and logged.",
        ),
        # --- the AI layer ---
        finding(
            12,
            "app/billing/charges.py",
            38,
            "ai-idempotency",
            "The retry loop calls the gateway up to three times, but `idempotency_key` is "
            "accepted and never forwarded to `self._gateway.charge`. If the first attempt "
            "reaches Stripe and the response is lost, the retry creates a second live "
            "charge. The ledger write on line 39 then records only the one that returned, "
            "so the duplicate is invisible to reconciliation.",
            source=FindingSource.AI,
            severity=Severity.ERROR,
            category="correctness",
            title="Retry can double-charge a customer",
            why_it_matters=(
                "A lost response is the normal failure mode of a payments API, not a rare "
                "one. This code turns it into a duplicate charge that the ledger cannot "
                "detect afterwards."
            ),
            suggested_fix=(
                "Forward the key and generate one when the caller omits it:\n\n"
                "    key = idempotency_key or f\"{customer_id}:{uuid4().hex}\"\n"
                "    result = self._gateway.charge(..., idempotency_key=key)"
            ),
        ),
        finding(
            13,
            "app/billing/charges.py",
            39,
            "ai-transaction-boundary",
            "`self._ledger.record(...)` commits its own session on every successful "
            "charge, so the gateway call and the ledger write are two separate "
            "transactions. A crash between them leaves money moved with no ledger entry, "
            "and the append-only ledger has no way to repair the gap later.",
            source=FindingSource.AI,
            severity=Severity.WARNING,
            category="correctness",
            title="Charge and ledger write are not atomic",
            why_it_matters=(
                "The ledger is documented as the append-only record of every settled "
                "charge. A gap in it breaks the one invariant the rest of billing relies on."
            ),
            suggested_fix=(
                "Write the ledger entry as pending before calling the gateway and settle "
                "it afterwards, so a crash leaves a recoverable row rather than nothing."
            ),
        ),
        finding(
            14,
            "app/billing/charges.py",
            33,
            "ai-float-precision",
            "`int(amount * 100 * self.fx_rate(\"eur\"))` truncates toward zero after two "
            "floating-point multiplications. For an amount of 19.99 at a rate of 0.92 the "
            "result is 1839 minor units instead of 1840, and the error compounds across a "
            "billing run.",
            source=FindingSource.AI,
            severity=Severity.WARNING,
            category="correctness",
            title="Currency conversion truncates instead of rounding",
            why_it_matters=(
                "Money handled as a float loses a cent at a time, and the discrepancy "
                "surfaces at reconciliation, long after the charge."
            ),
            suggested_fix=(
                "Convert with Decimal and round explicitly:\n\n"
                "    minor = (Decimal(str(amount)) * 100 * rate).quantize(Decimal(1), ROUND_HALF_UP)"
            ),
        ),
        finding(
            15,
            "app/billing/gateway.py",
            26,
            "ai-timeout",
            "The request timeout is raised to 120 seconds. Combined with three retries in "
            "`ChargeService.charge`, one call can now hold a worker for six minutes, which "
            "is longer than the webhook and load-balancer timeouts in front of it.",
            source=FindingSource.AI,
            severity=Severity.WARNING,
            category="reliability",
            title="Timeout budget exceeds the caller's",
            why_it_matters=(
                "The caller gives up and retries while this request is still open, so the "
                "system does more work under load exactly when it has least capacity."
            ),
            suggested_fix="Set a per-attempt timeout of 10-15s and bound the total retry budget instead.",
        ),
        finding(
            16,
            "app/billing/gateway.py",
            25,
            "ai-key-plumbing",
            "The Authorization header now uses the `key` parameter passed in by the caller "
            "instead of the gateway's own `self._key`. Every call site must remember to "
            "pass the right credential, and one that forgets authenticates as whatever it "
            "happens to send.",
            source=FindingSource.AI,
            severity=Severity.INFO,
            category="security",
            title="Credential moved out of the gateway",
            why_it_matters="Credentials are easiest to audit when exactly one object owns them.",
            suggested_fix="Keep `self._key` as the source of truth and drop the `key` parameter.",
        ),
    ]

    return PullRequestRecord(
        id="pr-2481",
        number=2481,
        title="Add multi-currency support and retries to ChargeService",
        author="priya-n",
        repository="northwind/payments-api",
        head_branch="feat/multi-currency-charges",
        base_branch="main",
        head_sha="a3f19c7d2b48e0516cfa9d3e77b1c204ff8e6a51",
        html_url="https://github.com/northwind/payments-api/pull/2481",
        status=ReviewStatus.CRITICAL,
        score=41,
        files_reviewed=3,
        additions=55,
        deletions=3,
        ai_used=True,
        posted=True,
        summary=(
            "This change adds currency conversion, a retry loop and a ledger write to "
            "ChargeService. Two problems block it. A live Stripe secret is committed on "
            "line 22 and has to be rotated, not just removed. The retry loop does not "
            "forward an idempotency key, so a lost gateway response produces a second "
            "live charge that the ledger cannot detect. Beyond those, the charge and the "
            "ledger write are not atomic, currency conversion truncates instead of "
            "rounding, and the whole path ships with no tests."
        ),
        duration_seconds=42.6,
        created_at=now - timedelta(hours=3),
        updated_at=now - timedelta(hours=2, minutes=41),
        findings=findings,
        files=[PAYMENTS_DIFF, LEDGER_DIFF, GATEWAY_DIFF],
        metrics=QualityMetrics(
            cyclomatic_complexity=12.0,
            max_function_length=38,
            functions_changed=3,
            documented_ratio=0.33,
            duplication_ratio=0.21,
            test_files_changed=0,
            source_files_changed=3,
            estimated_coverage_delta=-4.2,
            naming_violations=0,
        ),
        is_demo=True,
    )


def _simple_record(
    record_id: str,
    number: int,
    title: str,
    author: str,
    repository: str,
    head_branch: str,
    status: ReviewStatus,
    score: int,
    hours_ago: float,
    duration: float,
    summary: str,
    findings: list[Finding],
    metrics: QualityMetrics,
    files_reviewed: int,
    additions: int,
    deletions: int,
    decision: str | None = None,
    ai_used: bool = True,
) -> PullRequestRecord:
    now = utcnow()
    owner, _, _ = repository.partition("/")

    return PullRequestRecord(
        id=record_id,
        number=number,
        title=title,
        author=author,
        repository=repository,
        head_branch=head_branch,
        base_branch="main",
        head_sha=f"{abs(hash(record_id)):040x}"[:40],
        html_url=f"https://github.com/{repository}/pull/{number}",
        status=status,
        score=score,
        files_reviewed=files_reviewed,
        additions=additions,
        deletions=deletions,
        ai_used=ai_used,
        posted=status is not ReviewStatus.REVIEWING,
        summary=summary,
        duration_seconds=duration,
        created_at=now - timedelta(hours=hours_ago),
        updated_at=now - timedelta(hours=hours_ago) + timedelta(seconds=duration),
        findings=findings,
        files=[],
        metrics=metrics,
        decision=decision,
        is_demo=True,
    )


def other_records() -> list[PullRequestRecord]:
    """The rest of the demo history, so tables, charts and filters have body."""
    return [
        _simple_record(
            "pr-2479",
            2479,
            "Cache exchange rates for the billing run",
            "marcus-t",
            "northwind/payments-api",
            "perf/cache-fx-rates",
            ReviewStatus.NEEDS_CHANGES,
            78,
            9,
            31.2,
            "Caching is correct but the TTL is read at import time, so changing it needs a "
            "redeploy. One debug print remains in the cache warm path.",
            [
                finding(1, "app/billing/fx.py", 41, "debug-leftover", "`print(rates)` left in the cache warm path."),
                finding(2, "app/billing/fx.py", 58, "high-complexity", "`refresh_rates` has a complexity of 11 against a limit of 10.", severity=Severity.WARNING),
                finding(
                    3,
                    "app/billing/fx.py",
                    22,
                    "ai-cache-invalidation",
                    "The TTL is read from settings at module import, so the cache keeps the "
                    "value the process started with and a configuration change has no effect "
                    "until redeploy.",
                    source=FindingSource.AI,
                    severity=Severity.WARNING,
                    category="reliability",
                    title="TTL is frozen at import time",
                    why_it_matters="Operators expect a settings change to take effect without a deploy.",
                    suggested_fix="Read `settings.fx_cache_ttl` inside `refresh_rates` rather than at module level.",
                ),
            ],
            QualityMetrics(
                cyclomatic_complexity=11.0,
                max_function_length=24,
                functions_changed=2,
                documented_ratio=0.8,
                duplication_ratio=0.05,
                test_files_changed=1,
                source_files_changed=2,
                estimated_coverage_delta=1.1,
            ),
            files_reviewed=3,
            additions=88,
            deletions=12,
        ),
        _simple_record(
            "pr-2476",
            2476,
            "Move invoice PDF rendering to a background worker",
            "lena-k",
            "northwind/payments-api",
            "chore/async-invoice-pdf",
            ReviewStatus.PASSED,
            96,
            27,
            24.8,
            "Clean separation of the render path from the request path. Tests cover both "
            "the enqueue and the failure branch.",
            [
                finding(1, "app/invoices/worker.py", 63, "long-line", "Line is 108 characters against a limit of 100."),
            ],
            QualityMetrics(
                cyclomatic_complexity=5.0,
                max_function_length=18,
                functions_changed=4,
                documented_ratio=1.0,
                duplication_ratio=0.02,
                test_files_changed=2,
                source_files_changed=3,
                estimated_coverage_delta=3.4,
            ),
            files_reviewed=5,
            additions=142,
            deletions=61,
            decision="approved",
        ),
        _simple_record(
            "pr-841",
            841,
            "Add role-based access control to the admin console",
            "dev-arjun",
            "northwind/internal-console",
            "feat/rbac",
            ReviewStatus.CRITICAL,
            52,
            15,
            38.9,
            "The permission check runs after the query, so a user without access still "
            "causes the data to be loaded and counted. Two endpoints skip the decorator "
            "entirely.",
            [
                finding(
                    1,
                    "console/views/users.py",
                    88,
                    "ai-authz-ordering",
                    "`require_role(\"admin\")` is checked after `User.objects.all()` has been "
                    "evaluated, so an unauthorised request still executes the query and the "
                    "row count leaks through the response timing.",
                    source=FindingSource.AI,
                    severity=Severity.ERROR,
                    category="security",
                    title="Authorisation checked after the query runs",
                    why_it_matters="An access check that runs after the work is an audit finding, not a control.",
                    suggested_fix="Move the decorator above the view body so the check precedes any query.",
                ),
                finding(2, "console/views/audit.py", 34, "bare-except", "`except:` around the audit write hides permission errors."),
                finding(3, "console/views/audit.py", 35, "silent-failure", "The audit write failure is swallowed with `pass`."),
                finding(4, "console/views/users.py", None, "missing-tests", "Three view modules changed with no test changes."),
                finding(5, "console/views/users.py", 12, "missing-docstring", "`UserListView` is public and undocumented.", severity=Severity.INFO),
            ],
            QualityMetrics(
                cyclomatic_complexity=9.0,
                max_function_length=44,
                functions_changed=7,
                documented_ratio=0.42,
                duplication_ratio=0.18,
                test_files_changed=0,
                source_files_changed=4,
                estimated_coverage_delta=-2.8,
                naming_violations=2,
            ),
            files_reviewed=4,
            additions=203,
            deletions=18,
        ),
        _simple_record(
            "pr-838",
            838,
            "Upgrade the console to Django 5.1",
            "lena-k",
            "northwind/internal-console",
            "chore/django-51",
            ReviewStatus.NEEDS_CHANGES,
            81,
            40,
            51.4,
            "The upgrade is mechanical and correct. Two settings keep deprecated names "
            "that Django 5.1 only warns about today and removes in 6.0.",
            [
                finding(1, "console/settings.py", 71, "todo-added", "TODO about the deprecated storage setting has no owner."),
                finding(2, "console/settings.py", 118, "long-line", "Line is 131 characters."),
                finding(
                    3,
                    "console/settings.py",
                    71,
                    "ai-deprecation",
                    "`DEFAULT_FILE_STORAGE` still uses the pre-4.2 name. Django 5.1 accepts it "
                    "with a warning and 6.0 drops it, so this upgrade leaves the next one "
                    "blocked on the same file.",
                    source=FindingSource.AI,
                    severity=Severity.WARNING,
                    category="maintainability",
                    title="Deprecated setting carried forward",
                    suggested_fix="Move the value under the `STORAGES` dict introduced in 4.2.",
                ),
            ],
            QualityMetrics(
                cyclomatic_complexity=3.0,
                max_function_length=12,
                functions_changed=1,
                documented_ratio=0.9,
                duplication_ratio=0.01,
                test_files_changed=1,
                source_files_changed=6,
                estimated_coverage_delta=0.0,
            ),
            files_reviewed=9,
            additions=76,
            deletions=74,
        ),
        _simple_record(
            "pr-154",
            154,
            "Stream large exports instead of buffering them",
            "marcus-t",
            "northwind/reporting-service",
            "perf/stream-exports",
            ReviewStatus.PASSED,
            93,
            52,
            19.7,
            "The streaming path is correct and the memory ceiling is now bounded by the "
            "chunk size rather than the export size.",
            [
                finding(1, "reporting/export.py", 47, "missing-docstring", "`stream_rows` is public and undocumented.", severity=Severity.INFO),
                finding(2, "reporting/export.py", 92, "long-line", "Line is 104 characters."),
            ],
            QualityMetrics(
                cyclomatic_complexity=6.0,
                max_function_length=21,
                functions_changed=3,
                documented_ratio=0.75,
                duplication_ratio=0.03,
                test_files_changed=2,
                source_files_changed=2,
                estimated_coverage_delta=2.6,
            ),
            files_reviewed=4,
            additions=97,
            deletions=140,
            decision="approved",
        ),
        _simple_record(
            "pr-151",
            151,
            "Add a scheduled job for weekly summary emails",
            "priya-n",
            "northwind/reporting-service",
            "feat/weekly-summary",
            ReviewStatus.NEEDS_CHANGES,
            74,
            66,
            29.1,
            "The job works but runs in the web process. Under a deploy it can start twice "
            "and send the summary to every account a second time.",
            [
                finding(
                    1,
                    "reporting/jobs/weekly.py",
                    18,
                    "ai-duplicate-send",
                    "The scheduler starts inside the web process, so every replica runs the "
                    "job. With two replicas each account receives the weekly summary twice, "
                    "and there is no send-log to detect it.",
                    source=FindingSource.AI,
                    severity=Severity.WARNING,
                    category="correctness",
                    title="Job runs once per replica",
                    suggested_fix="Run the scheduler in a dedicated worker, or take an advisory lock before sending.",
                ),
                finding(2, "reporting/jobs/weekly.py", 44, "too-many-arguments", "`build_summary` takes 7 parameters.", severity=Severity.INFO),
                finding(3, "reporting/jobs/weekly.py", 61, "mutable-default-argument", "`recipients=[]` is shared across calls.", severity=Severity.ERROR),
                finding(4, "reporting/jobs/weekly.py", None, "missing-tests", "The job module has no accompanying test."),
            ],
            QualityMetrics(
                cyclomatic_complexity=8.0,
                max_function_length=36,
                functions_changed=4,
                documented_ratio=0.5,
                duplication_ratio=0.12,
                test_files_changed=0,
                source_files_changed=2,
                estimated_coverage_delta=-1.4,
                naming_violations=1,
            ),
            files_reviewed=2,
            additions=118,
            deletions=4,
        ),
        _simple_record(
            "pr-2483",
            2483,
            "Reduce the payments webhook timeout to 5s",
            "dev-arjun",
            "northwind/payments-api",
            "fix/webhook-timeout",
            ReviewStatus.REVIEWING,
            0,
            0.05,
            0.0,
            "",
            [],
            QualityMetrics(),
            files_reviewed=0,
            additions=0,
            deletions=0,
            ai_used=False,
        ),
        _simple_record(
            "pr-77",
            77,
            "Initial commit of the design token package",
            "lena-k",
            "northwind/design-tokens",
            "feat/tokens",
            ReviewStatus.PASSED,
            100,
            120,
            11.3,
            "No issues found in the changed lines.",
            [],
            QualityMetrics(
                cyclomatic_complexity=1.0,
                max_function_length=6,
                functions_changed=1,
                documented_ratio=1.0,
                duplication_ratio=0.0,
                test_files_changed=1,
                source_files_changed=1,
                estimated_coverage_delta=0.0,
            ),
            files_reviewed=6,
            additions=214,
            deletions=0,
            decision="approved",
        ),
    ]


REPOSITORY_DETAILS = {
    "northwind/payments-api": {"language": "Python", "private": True, "auto_review": True},
    "northwind/internal-console": {"language": "Python", "private": True, "auto_review": True},
    "northwind/reporting-service": {"language": "Python", "private": False, "auto_review": True},
    "northwind/design-tokens": {"language": "TypeScript", "private": False, "auto_review": False},
}


async def seed(store: ReviewStore) -> None:
    """Fill an empty store with the demo history.

    Does nothing when the store already holds records, so a real review produced
    by the pipeline is never shadowed by fabricated data.
    """
    if not store.is_empty:
        return

    await store.put_pull_request(flagship_record())

    for record in other_records():
        await store.put_pull_request(record)

    for full_name, details in REPOSITORY_DETAILS.items():
        repo_id = full_name.replace("/", "__")
        repository = store.get_repository(repo_id)

        if repository is None:
            owner, _, name = full_name.partition("/")
            repository = RepositoryRecord(id=repo_id, name=name, owner=owner, full_name=full_name)

        repository.language = details["language"]
        repository.private = details["private"]
        repository.auto_review = details["auto_review"]
        repository.active = True
        repository.is_demo = True
        await store.put_repository(repository)

    store.seeded_with_demo_data = True
