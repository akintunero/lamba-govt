INSERT INTO legacy_citizens (national_id, full_name, date_of_birth, registration_date, status, region_code, metadata)
VALUES
  ('LAM-1985-004521', 'Amina Okonkwo', '1985-03-14', '2001-06-12', 'archived', 'NG-LA', '{"source_system":"govrecords-v1"}'),
  ('LAM-1972-001893', 'Chidi Eze', '1972-11-02', '1998-01-22', 'archived', 'NG-AB', '{"source_system":"govrecords-v1"}'),
  ('LAM-1990-007712', 'Fatima Bello', '1990-07-19', '2008-09-03', 'archived', 'NG-KN', '{"source_system":"govrecords-v1"}')
ON CONFLICT (national_id) DO NOTHING;

INSERT INTO legacy_documents (legacy_citizen_id, document_type, reference_number, issued_date, status, file_path, metadata)
SELECT legacy_id, 'birth_certificate', 'BC-2001-004521', '2001-06-15', 'archived', '/archive/bc/2001/004521.pdf', '{"format":"pdf-a"}'
FROM legacy_citizens WHERE national_id = 'LAM-1985-004521'
ON CONFLICT (reference_number) DO NOTHING;

INSERT INTO legacy_documents (legacy_citizen_id, document_type, reference_number, issued_date, status, file_path, metadata)
SELECT legacy_id, 'national_id_card', 'NIC-1998-001893', '1998-02-01', 'archived', '/archive/nic/1998/001893.tif', '{"format":"tiff"}'
FROM legacy_citizens WHERE national_id = 'LAM-1972-001893'
ON CONFLICT (reference_number) DO NOTHING;

INSERT INTO legacy_cases (case_number, legacy_citizen_id, case_type, opened_date, closed_date, status, summary)
SELECT 'CASE-2005-8821', legacy_id, 'identity_verification', '2005-04-10', '2005-05-02', 'closed', 'Legacy identity verification completed'
FROM legacy_citizens WHERE national_id = 'LAM-1985-004521'
ON CONFLICT (case_number) DO NOTHING;

INSERT INTO legacy_compliance_reports (report_code, ministry_code, period_start, period_end, status, summary, record_count)
VALUES
  ('CR-2019-Q4-MIN-01', 'MIN-01', '2019-10-01', '2019-12-31', 'archived', 'Q4 2019 citizen registration compliance summary', 12450),
  ('CR-2020-Q1-MIN-03', 'MIN-03', '2020-01-01', '2020-03-31', 'archived', 'Q1 2020 document processing compliance report', 8920)
ON CONFLICT (report_code) DO NOTHING;
