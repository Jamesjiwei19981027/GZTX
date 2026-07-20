def test_secret_box_roundtrip():
    from app.services.secret_box import encrypt_str, decrypt_str

    plain = '{"token":"abc-123"}'
    token = encrypt_str(plain)
    assert token != plain
    assert decrypt_str(token) == plain
