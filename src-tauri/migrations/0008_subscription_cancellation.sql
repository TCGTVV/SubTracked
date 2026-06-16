-- Optionale Kündigungsangaben pro Abo (Backlog: "Kündigungsfrist / kündigen bis"-Datum).
-- Zwei Modi, beide optional und sich gegenseitig ausschließend:
--   cancel_mode = 'period' -> Frist (cancel_period_value + cancel_period_unit); "kündigen bis"
--                             wird im Frontend aus der nächsten Fälligkeit minus Frist berechnet.
--   cancel_mode = 'date'   -> festes Stichdatum (cancel_date, ISO YYYY-MM-DD).
--   cancel_mode = NULL     -> keine Kündigung getrackt (alle Felder NULL).
-- NULL erfüllt die CHECK-Constraints (NULL IN (...) ist UNKNOWN, nicht FALSE), Bestandszeilen bleiben gültig.
ALTER TABLE subscriptions ADD COLUMN cancel_mode TEXT CHECK (cancel_mode IN ('period','date'));
ALTER TABLE subscriptions ADD COLUMN cancel_period_value INTEGER;
ALTER TABLE subscriptions ADD COLUMN cancel_period_unit TEXT CHECK (cancel_period_unit IN ('days','weeks','months'));
ALTER TABLE subscriptions ADD COLUMN cancel_date TEXT;
