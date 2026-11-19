USE pcm_db;

INSERT IGNORE INTO departments (name, code, jurisdiction, contact_email, description) VALUES
('PMC Road & Traffic Engineering', 'PMC-ROADS', 'Pune Municipal Corporation', 'roads@pmc-civic.example', 'Road resurfacing, footpath maintenance, and urban corridors.'),
('PMC Water Supply & Drainage', 'PMC-WATER', 'Pune Municipal Corporation', 'water@pmc-civic.example', 'Equitable municipal water supply and stormwater drainage.'),
('Pune Solid Waste & Sanitation', 'PMC-SWM', 'Pune Municipal Corporation', 'sanitation@pmc-civic.example', 'Waste collection and civic sanitation.'),
('Maharashtra Electricity Distribution (MSEDCL)', 'MSEDCL-PN', 'Maharashtra State', 'grid@msedcl-civic.example', 'Feeder reliability and power outage resolution.'),
('Public Procurement & Works Audit', 'PROC-AUDIT', 'Maharashtra State', 'audit@transparency-civic.example', 'Tender compliance and public works verification.'),
('Civic Licensing & Building Approvals', 'CIVIC-LIC', 'Pune Municipal Corporation', 'permits@pmc-civic.example', 'Municipal permits and compliance inspections.');

INSERT IGNORE INTO external_event_sources (source_name, source_url, license_type, attribution_text) VALUES
('Pune Open Civic Data Portal', 'https://opendata.pmc.gov.in', 'Open Government Data License - India', 'Public civic assembly & municipal townhall registry');
