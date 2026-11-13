-- The six Request Categories (GLOSSARY.md). Reference data: every environment needs it.
INSERT INTO "request_categories" ("id", "name", "code", "sort_order") VALUES
  ('electrical', 'Electrical', 'ELEC', 1),
  ('plumbing', 'Plumbing', 'PLUMB', 2),
  ('furniture', 'Furniture', 'FURN', 3),
  ('network', 'Internet and network', 'NET', 4),
  ('classroom_equipment', 'Classroom equipment', 'CLASS', 5),
  ('other', 'Other', 'OTHER', 6);
