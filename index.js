const express = require('express');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const LocalStrategy = require('passport-local').Strategy;
const jwt = require('jsonwebtoken');
const request = require('request');
const fs = require('fs');
const sharp = require('sharp');
const passportJWT = require("passport-jwt");
const JWTStrategy   = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;
const user =  require('./routes/user');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(session({
  secret: 'MySuperSecretPassPhrase',
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());
app.use('/thumbnail', passport.authenticate('jwt', {session: false}), user);

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

passport.use(new LocalStrategy(
  {username: 'email',password: 'password'},
  function (email, password, cb) {
        //this one is typically a DB call. Assume that the returned user object is pre-formatted and ready for storing in JWT
        return userSchema.findOne({email, password})
           .then(user => {
               if (!user) {
                   return cb(null, false, {message: 'Incorrect email or password.'});
               }
               return cb(null, user, {message: 'Logged In Successfully'});
          })
          .catch(err => cb(err));
    }
));

passport.use(new JWTStrategy({
        jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
        secretOrKey   : 'MySuperSecretPassPhrase'
    },
    function (jwtPayload, cb) {
        //find the user in db if needed. This functionality may be omitted if you store everything you'll need in JWT payload.
        return userSchema.findOneById(jwtPayload.id)
            .then(user => {
                return cb(null, user);
            })
            .catch(err => {
                return cb(err);
            });
    }
));

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

// app.get('/jwt', (req, res) => {
//   let privateKey = fs.readFileSync('./private.pem', 'utf8');
//   let token = jwt.sign({
//     "body": "stuff"
//   }, "MySuperSecretPassPhrase", {
//     algorithm: 'HS256'
//   });
//   jwt.varify(token);
//   res.send(token);
// })

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', function(req, res) {
  User.register({
    username: req.body.username
  }, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect('/register');
    } else {
      passport.authenticate('local')(req, res, function() {
        res.redirect('/thumbnail');
      });
    }
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', function(req, res, next) {
  passport.authenticate('local', {session: false}, (err, user, info) => {
    if (err || !user) {
      return res.status(400).json({
        message: 'Something is not right',
        user: user
      });
    }
    req.login(user, {
      session: false
    }, (err) => {
      if (err) {
        res.send(err);
      }
      // generate a signed son web token with the contents of user object and return it in the response
      const token = jwt.sign(user, 'MySuperSecretPassPhrase');
      return res.json({
        user,
        token
      });
    });
  })(req, res);
});

app.get('/thumbnail', (req, res) => {
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
  if (typeof req.headers.authorization) {
    // retrieve the authorization header and parse out the
    // JWT using the split function
    let token = req.headers.authorization.split(" ")[1];
    let privateKey = fs.readFileSync('./private.pem', 'utf8');
    // Here we validate that the JSON Web Token is valid and has been
    // created using the same private pass phrase
    jwt.verify(token, privateKey, {
      algorithm: "HS256"
    }, (err, user) => {

      // if there has been an error...
      if (err) {
        // shut them out!
        res.status(500).json({
          error: "Not Authorized"
        });
        throw new Error("Not Authorized");
      }
      // if the JWT is valid, allow them to hit
      // the intended endpoint
      return next();
    });
  } else {
    // No authorization header exists on the incoming
    // request, return not authorized and throw a new error
    res.status(500).json({
      error: "Not Authorized"
    });
    throw new Error("Not Authorized");
  }
}

app.listen(3000, () => {
  console.log('port is running at 3000');
});
