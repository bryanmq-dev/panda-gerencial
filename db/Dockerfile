FROM postgres:17-alpine
# los scripts de inicio van dentro de la imagen: no dependen de montar archivos del repositorio
COPY --chmod=755 . /docker-entrypoint-initdb.d/
