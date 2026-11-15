-- 0002 tried to reject NaN with (metric_value = metric_value), but PostgreSQL treats
-- NaN as equal to itself, so that check passes. Replace it with explicit checks that
-- also reject infinities, on every measured or reported number.

alter table run_metrics drop constraint if exists run_metrics_metric_value_check;
alter table run_metrics add constraint run_metrics_metric_value_finite
  check (metric_value not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8));

alter table reported_metrics add constraint reported_metrics_metric_value_finite
  check (metric_value not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8));
alter table reported_metrics add constraint reported_metrics_dispersion_finite
  check (dispersion is null or dispersion not in ('NaN'::float8, 'Infinity'::float8));
alter table reported_metrics add constraint reported_metrics_tolerance_finite
  check (tolerance is null or tolerance not in ('NaN'::float8, 'Infinity'::float8));
