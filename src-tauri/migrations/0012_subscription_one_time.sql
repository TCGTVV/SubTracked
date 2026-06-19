-- Einmalige Ausgaben: analog zu incomes.one_time ein Flag an subscriptions.
-- Simples ADD COLUMN (kein Tabellen-Rebuild -> kein FK-787-Risiko, kein -- no-transaction).
-- Bestandszeilen sind wiederkehrend (one_time = 0).
ALTER TABLE subscriptions ADD COLUMN one_time INTEGER NOT NULL DEFAULT 0;
