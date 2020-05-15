
let express = require('express')
let bodyParser = require('body-parser')
let request = require('request')
let querystring = require('querystring')
//var schedule = require('node-schedule');
let cors = require('cors');
let firebase = require('firebase');

let CronJob  = require('cron').CronJob;

const firebaseConfig = {
  apiKey: "AIzaSyB-cSazjO8YNUx_INqQC1xt1r-EJQU1PD8",
  authDomain: "todo-f6123.firebaseapp.com",
  databaseURL: "https://todo-f6123.firebaseio.com",
  projectId: "todo-f6123",
  storageBucket: "todo-f6123.appspot.com",
  messagingSenderId: "15763357581",
  appId: "1:15763357581:web:2d16546a9a0568be2387c4",
  measurementId: "G-R0972DXH50"
};

firebase.initializeApp(firebaseConfig);

let app = express()
// parse JSON
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Origin, Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader('Content-type', 'application/x-www-form-urlencoded')
    next();
})

app.use(cors());
// CONFIG
var cookieParser = require('cookie-parser');

var client_id = '7f9cbbd68daf4d19a8890769e24edd46'; // Your client id
var client_secret = '5e917c1f5f3e4184a24e4c569a7a6b81'; // Your secret
var redirect_uri = 'https://apispo.herokuapp.com/callback/'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';


app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html')
})

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'user-read-email',
    'user-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-read-private',
    'playlist-modify-private',
    'user-library-modify',
    'user-library-read',
    'user-top-read',
    'user-read-playback-position',
    'user-read-recently-played',
    'user-follow-read',
    'user-follow-modify'
  ];
  scope = encodeURIComponent(scope);
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state,
      show_dialog: true
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });


        firebase.firestore().collection('authen').add({
          access_token: access_token,
          refresh_token: refresh_token,
          expired_in: 3600
        }).then(res => console.log(res.id));

        // we can also pass the token to the browser to make requests from there
        res.redirect('http://localhost:3000/home#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

const refreshToken = () => {
  firebase.firestore().collection('authen').get()
  .then(result => result.docs.forEach(doc => {
    var refresh_token = doc.data().refresh_token;
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
      form: {
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        firebase.firestore().collection('authen').get()
        .then(result => result.docs.forEach(doc => {
          firebase.firestore().collection('authen').doc(doc.id).update({
            access_token: body.access_token
          })
        }))
      }
    });

  }))
}

var job = new CronJob('*/50 * * * *', function() {
  refreshToken();
  console.log('job running...');
}, function() {
  // job stops
},
true,
);

job.start();

console.log('Listening on 8000');
app.listen(8000);