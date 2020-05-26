const express = require('express');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const jwt = require('jsonwebtoken');
const request = require('request');
const fs = require('fs');
const sharp = require('sharp');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: 'my secret',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/CashFloDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  token: String,
});

userSchema.plugin(passportLocalMongoose);

mongoose.set('useCreateIndex', true)
const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});


app.get('/', (req, res) => {
  res.render('home');
});

app.get('/jwt', (req, res) => {
    let privateKey = fs.readFileSync('./private.pem', 'utf8');
    let token = jwt.sign({ "body": "stuff" }, "MySuperSecretPassPhrase", { algorithm: 'HS256'});
    jwt.varify(token);
    res.send(token);
})

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', function(req, res) {
  User.register({ username: req.body.username}, req.body.password,  function(err, user) {
    if (err) {
      console.log(err);
      res.redirect('/register');
    } else {
      passport.authenticate('local')(req, res, function() {
        let privateKey = fs.readFileSync('./private.pem', 'utf8');
        let token = jwt.sign({ "body": "stuff" }, "MySuperSecretPassPhrase", { algorithm: 'HS256'});
        jwt.varify(token);
        req.headers.authorization = token;
        res.redirect('/thumbnail');
      });
    }
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post("/login", function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });
  req.login(user, function(err) {
    if (err) {
      console.log(err);
    } else {
      console.log(req.headers.authorization = user.token);
      passport.authenticate('local')(req, res, function() {
        res.redirect('/thumbnail');
      });
    }
  });
});

app.get('/thumbnail',isAuthenticated, (req, res) => {
  res.render('thumbnail');
});

var download = function(uri, filename, callback) {
  request.head(uri, function(err, res, body) {
    console.log('content-type:', res.headers['content-type']);
    console.log('content-length:', res.headers['content-length']);
    request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
  });
};

app.post('/thumbnail', (req, res) => {
  var ImageUrl = req.body.urlLink;

  download(ImageUrl, 'public/thumbnail.png', function() {
    console.log('done');
  });
  sharp('public/thumbnail.png').resize({
      width: 50,
      height: 50,
      gravity: "faces",
      crop: "fill"
    }).toFile('public/thumbnail1.png')
    .then(function(newFileInfo) {
      console.log("Image Resized");
    })
    .catch(function(err) {
      console.log("Got Error");
    });

  res.render('thumbnail');
});


function isAuthenticated(req, res, next) {
    if (typeof req.headers.authorization !== "undefined") {
        // retrieve the authorization header and parse out the
        // JWT using the split function
        let token = req.headers.authorization.split(" ")[1];
        let privateKey = fs.readFileSync('./private.pem', 'utf8');
        // Here we validate that the JSON Web Token is valid and has been
        // created using the same private pass phrase
        jwt.verify(token, privateKey, { algorithm: "HS256" }, (err, user) => {

            // if there has been an error...
            if (err) {
                // shut them out!
                res.status(500).json({ error: "Not Authorized" });
                throw new Error("Not Authorized");
            }
            // if the JWT is valid, allow them to hit
            // the intended endpoint
            return next();
        });
    } else {
        // No authorization header exists on the incoming
        // request, return not authorized and throw a new error
        res.status(500).json({ error: "Not Authorized" });
        throw new Error("Not Authorized");
    }
}

app.listen(3000, () => {
  console.log('port is running at 3000');
});
