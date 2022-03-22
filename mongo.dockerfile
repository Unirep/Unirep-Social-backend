FROM mongo:4.4

RUN echo "rs.initiate();" > /docker-entrypoint-initdb.d/replica-init.js

CMD [ "--replSet", "rs" ]
