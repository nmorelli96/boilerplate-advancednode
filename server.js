"use strict";
require("dotenv").config();
const express = require("express");
const myDB = require("./connection");
const fccTesting = require("./freeCodeCamp/fcctesting.js");
const session = require("express-session");
const passport = require("passport");
const { ObjectID } = require("mongodb");
const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");
const routes = require("./routes.js"); // file with all routes
const auth = require("./auth.js"); // file with all the serializing / strategies
const passportSocketIo = require("passport.socketio");
const cookieParser = require("cookie-parser");

//initialize a new memory store, from express-session
const MongoStore = require("connect-mongo")(session);
const URI = process.env.MONGO_URI;
const store = new MongoStore({ url: URI });

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.set("view engine", "pug"); //assign pug as the view engine property's value:
app.set("views", "./views/pug"); //This tells Express to render all views relative to that directory.

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    store: store,
    cookie: { secure: false },
    key: "express.sid",
  })
);

app.use(passport.initialize());
app.use(passport.session());

fccTesting(app); //For FCC testing purposes
app.use("/public", express.static(process.cwd() + "/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

myDB(async (client) => {
  const myDataBase = await client.db("fcc-adv-node").collection("users");

  routes(app, myDataBase); //routes.js

  app.use((req, res, next) => {
    // handling missing pages (404)
    res.status(404).type("text").send("Not Found");
  });

  auth(app, myDataBase); //auth.js

  io.use(
    passportSocketIo.authorize({
      cookieParser: cookieParser,
      key: "express.sid",
      secret: process.env.SESSION_SECRET,
      store: store,
      success: onAuthorizeSuccess,
      fail: onAuthorizeFail,
    })
  );

  let currentUsers = 0;
  io.on("connection", (socket) => {
    console.log("user " + socket.request.user.username + " connected");

    ++currentUsers;
    io.emit("user", {
      username: socket.request.user.username,
      currentUsers,
      connected: true,
    });
    console.log("A user has connected");

    socket.on("chat message", (message) => {
      io.emit("chat message", {
        username: socket.request.user.username,
        message,
      });
    });

    socket.on("disconnect", () => {
      console.log("A user has disconnected");
      --currentUsers;
      io.emit("user", {
        username: socket.request.user.username,
        currentUsers,
        connected: false,
      });
    });
  });

  // Be sure to add this...
}).catch((e) => {
  app.route("/").get((req, res) => {
    res.render("index", {
      title: e,
      message: "Unable to connect to database",
    });
  });
});
// app.listen out here...

/*
app.route("/").get((req, res) => {
  res.render("index", { title: "Hello", message: "Please log in" }); //This will render the pug template.
});*/

function onAuthorizeSuccess(data, accept) {
  console.log("successful connection to socket.io");

  accept(null, true);
}
function onAuthorizeFail(data, message, error, accept) {
  if (error) throw new Error(message);
  console.log("failed connection to socket.io:", message);
  accept(null, false);
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Listening on port " + PORT);
});
