"""Credential parsing must accept a path or pasted JSON and never leak it."""
import json

import pytest

from app.core.firebase import FirebaseCredentialsError, _credential_source

FAKE_SECRET = "-----BEGIN PRIVATE KEY-----\\nFAKE-NOT-A-REAL-KEY\\n-----END PRIVATE KEY-----\\n"
FAKE_KEY = {
    "type": "service_account",
    "project_id": "demo-project",
    "private_key": FAKE_SECRET,
    "client_email": "svc@demo-project.iam.gserviceaccount.com",
}


def test_path_to_existing_file_is_returned_as_is(tmp_path):
    f = tmp_path / "serviceAccount.json"
    f.write_text(json.dumps(FAKE_KEY))
    assert _credential_source(str(f)) == str(f)


def test_pasted_json_is_parsed_into_a_dict():
    # Exactly the mistake seen on Render: the key JSON pasted into the variable.
    value = "\n" + json.dumps(FAKE_KEY, indent=2) + "\n"
    assert _credential_source(value) == FAKE_KEY


def test_missing_file_error_explains_the_fix():
    with pytest.raises(FirebaseCredentialsError, match="/etc/secrets/serviceAccount.json"):
        _credential_source("/etc/secrets/nope.json")


@pytest.mark.parametrize("value", [
    '{"type": "service_account", "private_key": "' + FAKE_SECRET,   # truncated paste
    json.dumps({**FAKE_KEY, "type": "authorized_user"}),             # wrong kind of key
])
def test_bad_json_errors_never_contain_the_secret(value):
    with pytest.raises(FirebaseCredentialsError) as info:
        _credential_source(value)
    assert "FAKE-NOT-A-REAL-KEY" not in str(info.value)
    assert info.value.__cause__ is None  # no chained error carrying the value
