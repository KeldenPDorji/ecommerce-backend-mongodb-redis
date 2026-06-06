// MongoDB replica set initialisation script
// Run once after all three containers are up:
//   docker compose exec mongo1 mongosh -u root -p rootpassword --authenticationDatabase admin \
//     --eval 'load("/docker-entrypoint-initdb.d/rs-init.js")'

rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1 },
  ],
});
