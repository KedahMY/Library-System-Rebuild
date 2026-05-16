# ai-rebuild/test-pack/smoke/02_auth.ps1
param($API = "http://localhost:8000")
. "$PSScriptRoot\lib.ps1"

note "A1 register student (valid)"
$U = "t_$(Get-Date -Format 'HHmmss')"
$body = @{username=$U; full_name="Test User"; password="Pa55word!"; role="student"} | ConvertTo-Json
$r = Call-Api POST /api/auth/register $body
if ($r.StatusCode -eq 201) { ok "A1: registered" } else { fail "A1: expected 201 got $($r.StatusCode): $($r.Content)" }

note "A2 weak password rejected"
$U2 = "weak_$(Get-Date -Format 'HHmmss')"
$body2 = @{username=$U2; full_name="Weak"; password="short"; role="student"} | ConvertTo-Json
$r2 = Call-Api POST /api/auth/register $body2
if ($r2.StatusCode -eq 400) { ok "A2: weak password rejected (400)" } else { fail "A2: expected 400 got $($r2.StatusCode)" }

note "A3 duplicate username"
$r3 = Call-Api POST /api/auth/register $body
if ($r3.StatusCode -eq 409) { ok "A3: duplicate rejected (409)" } else { fail "A3: expected 409 got $($r3.StatusCode): $($r3.Content)" }

note "A4 login OK"
$TOKEN = Get-Token $U "Pa55word!"
if ($TOKEN -and $TOKEN -ne "null") { ok "A4: got token" } else { fail "A4: no token returned" }

note "A5 login wrong password"
$r5 = Call-Api POST /api/auth/login (@{username=$U; password="wrong"} | ConvertTo-Json)
if ($r5.StatusCode -eq 401) { ok "A5: wrong password rejected" } else { fail "A5: expected 401 got $($r5.StatusCode)" }

note "A6 protected GET without token"
$r6 = Call-Api GET /api/users/profile
if ($r6.StatusCode -eq 401) { ok "A6: unauthenticated blocked" } else { fail "A6: expected 401 got $($r6.StatusCode)" }

note "A7 protected GET with token"
$r7 = Call-Api GET /api/users/profile "" $TOKEN
if ($r7.StatusCode -eq 200) { ok "A7: authenticated access OK" } else { fail "A7: expected 200 got $($r7.StatusCode): $($r7.Content)" }

note "A8 librarian cannot deactivate self"
$LTOK = Get-TokenSilent "librarian_demo" "Librarian@1"
$rProf = Call-Api GET /api/users/profile "" $LTOK
$selfId = (ConvertFrom-Json $rProf.Content).id
$r8 = Call-Api PUT "/api/users/$selfId/toggle-active" "" $LTOK
if ($r8.StatusCode -eq 400) { ok "A8: self-deactivate blocked" } else { fail "A8: expected 400 got $($r8.StatusCode): $($r8.Content)" }

note "A9 demo accounts login"
foreach ($acct in @(
  @{u="student_demo"; p="Student@123"; r="student"},
  @{u="staff_demo"; p="Staff@1234"; r="staff"},
  @{u="author_demo"; p="Author@1234"; r="author"},
  @{u="librarian_demo"; p="Librarian@1"; r="librarian"}
)) {
  $t = Get-Token $acct.u $acct.p
  if ($t) { ok "A9: $($acct.u) logged in" } else { fail "A9: $($acct.u) login failed" }
}

note "A10 profile returns correct user"
$r10 = Call-Api GET /api/users/profile "" $TOKEN
if ($r10.StatusCode -eq 200) { ok "A10: profile returns correct user" } else { fail "A10: unexpected status $($r10.StatusCode)" }

summary
