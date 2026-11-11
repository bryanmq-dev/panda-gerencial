#!/bin/bash
# Un servidor Postgres, dos bases: la transaccional y el almacén.
# Solo corre la primera vez (volumen vacío). Para repetir: docker compose down -v
set -e
p() { psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" "$@"; }

p -d postgres -c "CREATE DATABASE panda_oltp" -c "CREATE DATABASE panda_dw"
for f in /docker-entrypoint-initdb.d/oltp/*.sql; do echo ">> oltp: $f"; p -d panda_oltp -f "$f"; done
for f in /docker-entrypoint-initdb.d/dw/*.sql;   do echo ">> dw: $f";   p -d panda_dw   -f "$f"; done
