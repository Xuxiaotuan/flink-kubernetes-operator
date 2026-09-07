-- Copyright 2018-2026 contributors to the OpenLineage project
-- SPDX-License-Identifier: Apache-2.0
SET 'execution.target' = 'remote';
SET 'rest.address' = 'lineage-session-rest';
SET 'rest.port' = '8081';
SET 'execution.runtime-mode' = 'batch';
SET 'parallelism.default' = '1';
SET 'table.dml-sync' = 'true';
SET 'execution.job-status-changed-listeners' = 'io.openlineage.flink.listener.OpenLineageJobStatusChangedListenerFactory';
SET 'openlineage.transport.type' = 'http';
SET 'openlineage.transport.url' = 'http://lineage-collector:8080';
SET 'openlineage.flink.disableCheckpointTracking' = 'true';
CREATE DATABASE lineage_acceptance;
USE lineage_acceptance;
CREATE TABLE Orders (order_id BIGINT, customer_id BIGINT, amount BIGINT, fee BIGINT)
WITH ('connector'='filesystem', 'path'='file:///evidence/direct/orders.csv', 'format'='csv');
CREATE TABLE Customers (customer_id BIGINT, tier STRING)
WITH ('connector'='filesystem', 'path'='file:///evidence/direct/customers.csv', 'format'='csv');
CREATE TABLE Detail (order_id BIGINT, tier STRING, net_amount BIGINT)
WITH ('connector'='filesystem', 'path'='file:///evidence/direct/detail', 'format'='csv');
CREATE TABLE Summary (tier STRING, total_amount BIGINT, order_count BIGINT)
WITH ('connector'='filesystem', 'path'='file:///evidence/direct/summary', 'format'='csv');
CREATE TEMPORARY VIEW Enriched AS
SELECT o.order_id, c.tier, o.amount + o.fee AS net_amount
FROM Orders o JOIN Customers c ON o.customer_id = c.customer_id
WHERE c.tier <> 'blocked'
AND o.customer_id IN (SELECT d.customer_id FROM Customers d WHERE d.tier <> 'blocked')
AND o.customer_id NOT IN (SELECT d.customer_id FROM Customers d WHERE d.tier = 'blocked')
AND EXISTS (SELECT 1 FROM Customers d WHERE d.customer_id = o.customer_id AND d.tier <> 'blocked')
AND NOT EXISTS (SELECT 1 FROM Customers d WHERE d.customer_id = o.customer_id AND d.tier = 'blocked');
EXECUTE STATEMENT SET
BEGIN
INSERT INTO Detail SELECT order_id, tier, net_amount FROM Enriched;
INSERT INTO Summary SELECT tier, SUM(net_amount), COUNT(order_id) FROM Enriched GROUP BY tier;
END;
