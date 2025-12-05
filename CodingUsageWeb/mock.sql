INSERT INTO vibe_usage_api_keys
(id, api_key, email, platform, app_name, created_at, last_ping_at, online, is_public)
VALUES(3, 'ck_test_user1_abc123def456789012345678', 'test_user1@example.com', 'win32', 'Cursor', 1765117823188, 1765164062594, 0, 1);
INSERT INTO vibe_usage_api_keys
(id, api_key, email, platform, app_name, created_at, last_ping_at, online, is_public)
VALUES(4, 'ck_test_user2_def456789012345678901234', 'test_user2@example.com', 'darwin', 'Cursor', 1765117985688, 1765163950598, 0, 1);
INSERT INTO vibe_usage_api_keys
(id, api_key, email, platform, app_name, created_at, last_ping_at, online, is_public)
VALUES(5, 'ck_test_user3_ghi789012345678901234567', 'test_user3@example.com', 'linux', 'Cursor', 1765118037473, 1765160052770, 0, 1);
INSERT INTO vibe_usage_api_keys
(id, api_key, email, platform, app_name, created_at, last_ping_at, online, is_public)
VALUES(6, 'ck_test_user4_jkl012345678901234567890', '7480047463120110593', 'win32', 'Trae', 1765118100000, 1765164000000, 0, 1);
INSERT INTO vibe_usage_api_keys
(id, api_key, email, platform, app_name, created_at, last_ping_at, online, is_public)
VALUES(7, 'ck_test_user5_mno345678901234567890123', '7480047463120110594', 'darwin', 'Trae', 1765118200000, 1765163800000, 0, 1);

INSERT INTO cursor_usage_reports
(id, api_key, email, expire_time, membership_type, api_spend, api_limit, auto_spend, auto_limit, host, platform, created_at)
VALUES(3, 'ck_test_user3_ghi789012345678901234567', 'test_user3@example.com', 1767225599000, 'pro', 4500, 4500, 0, 15000, 'LINUX-TEST003', 'linux', 1765117823207);
INSERT INTO cursor_usage_reports
(id, api_key, email, expire_time, membership_type, api_spend, api_limit, auto_spend, auto_limit, host, platform, created_at)
VALUES(2, 'ck_test_user2_def456789012345678901234', 'test_user2@example.com', 1767184287000, 'pro', 4590, 4500, 7532, 15000, 'MACBOOK-TEST002', 'darwin', 1765157578823);

INSERT INTO cursor_usage_reports
(id, api_key, email, expire_time, membership_type, api_spend, api_limit, auto_spend, auto_limit, host, platform, created_at)
VALUES(9, 'ck_eb93b2b014159c4c8700b060ca2afd33', '1459189802@qq.com', 1765184287000, 'pro', 4590, 4500, 0, 15000, 'IQ275CG42123NJ', 'win32', 1765180990001);
INSERT INTO cursor_usage_reports
(id, api_key, email, expire_time, membership_type, api_spend, api_limit, auto_spend, auto_limit, host, platform, created_at)
VALUES(10, 'ck_eb93b2b014159c4c8700b060ca2afd33', '1459189802@qq.com', 1765184287000, 'pro', 4590, 4500, 0, 15000, 'IQ275CG42123NJ', 'win32', 1765180996634);

INSERT INTO trae_usage_reports
(id, api_key, email, expire_time, membership_type, total_usage, used_usage, host, platform, created_at)
VALUES(2, 'ck_test_user5_mno345678901234567890123', '7480047463120110594', 1767225599, 'pro', 600, 280, 'MACBOOK-TRAE002', 'darwin', 1765157578823);

INSERT INTO cursor_usage_reports
(id, api_key, email, expire_time, membership_type, api_spend, api_limit, auto_spend, auto_limit, host, platform, created_at)
VALUES(11, 'ck_test_user1_abc123def456789012345678', 'test_user1@example.com', 1767225599000, 'pro', 3800, 4500, 5200, 15000, 'WINDOWS-TEST001', 'win32', 1765164062594);

INSERT INTO trae_usage_reports
(id, api_key, email, expire_time, membership_type, total_usage, used_usage, host, platform, created_at)
VALUES(3, 'ck_test_user4_jkl012345678901234567890', '7480047463120110593', 1767225599, 'pro', 600, 350, 'WINDOWS-TRAE001', 'win32', 1765164000000);
