var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var express = require('express');
var app = express();
var serv = require('http').Server(app);
var io = require('socket.io')(serv);
var michael = require('./server/test/test.js');
// DB.
var mongojs = require('mongojs');
var db = mongojs('localhost:27017/game', ['account', 'progress']);
// Serve public static files (CSS/JS).
app.use(express.static(__dirname + '/client'));
// Serve our only route '/'.
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/client/index.html');
});
var SOCKET_LIST = {};
var playerList = {};
/**
 * Create a base class.
 */
var Entity = (function () {
    function Entity() {
        this.x = 250;
        this.y = 250;
        this.spdX = 0;
        this.spdY = 0;
        this.id = '';
    }
    Entity.prototype.updatePosition = function () {
        this.x += this.spdX;
        this.y += this.spdY;
    };
    // getDistance() {
    //     return Math.sqrt(Math.pow(this.x-pt.x,2) + Math.pow(this.y-pt.y,2))
    // }
    Entity.prototype.update = function () {
        this.updatePosition();
    };
    return Entity;
}());
/**
 *
 */
var Player = (function (_super) {
    __extends(Player, _super);
    function Player(id) {
        var _this = _super.call(this) || this;
        _this.number = "" + Math.floor(10 * Math.random());
        _this.pressingRight = false;
        _this.pressingLeft = false,
            _this.pressingUp = false;
        _this.pressingDown = false;
        _this.maxSpd = 10;
        return _this;
    }
    Player.prototype.updateSpd = function () {
        if (this.pressingRight) {
            this.spdX = this.maxSpd;
        }
        else if (this.pressingLeft) {
            this.spdX = -this.maxSpd;
        }
        else {
            this.spdX = 0;
        }
        if (this.pressingUp) {
            this.spdY = -this.maxSpd;
        }
        else if (this.pressingDown) {
            this.spdY = this.maxSpd;
        }
        else {
            this.spdY = 0;
        }
        this.update();
    };
    return Player;
}(Entity));
var onConnect = function (socket) {
    var player = new Player(socket.id);
    playerList[socket.id] = player;
    socket.on('keyPress', function (data) {
        if (data.inputId === 'left') {
            player.pressingLeft = data.state;
        }
        else if (data.inputId === 'right') {
            player.pressingRight = data.state;
        }
        else if (data.inputId === 'up') {
            player.pressingUp = data.state;
        }
        else if (data.inputId === 'down') {
            player.pressingDown = data.state;
        }
    });
};
var onDisconnect = function (socket) {
    delete playerList[socket.id];
};
var update = function () {
    var pack = [];
    for (var i in playerList) {
        var player = playerList[i];
        player.updateSpd();
        pack.push({
            x: player.x,
            y: player.y,
            number: player.number
        });
    }
    return pack;
};
io.on('connection', function (socket) {
    // Create unique user socket and throw them in the list.
    socket.id = Math.random();
    SOCKET_LIST[socket.id] = socket;
    onConnect(socket);
    // Event hooks while a user is connected.
    socket.on('chat message', function (msg) {
        console.log('message: ' + msg);
        io.emit('chat message', msg);
    });
    socket.on('signIn', function (data) {
        isValidPassword(data, function (res) {
            if (res) {
                onConnect(socket);
                socket.emit('signInResponse', { success: true });
            }
            else {
                socket.emit('signInResponse', { success: false });
            }
        });
    });
    socket.on('signUp', function (data) {
        isUsernameTaken(data, function (res) {
            if (res) {
                socket.emit('signUpResponse', { success: false });
            }
            else {
                addUser(data, function () {
                    socket.emit('signUpResponse', { success: true });
                });
            }
        });
    });
    socket.on('disconnect', function () {
        delete SOCKET_LIST[socket.id];
        onDisconnect(socket);
    });
    socket.on('sendMsgToServer', function (data) {
        var playerName = ("" + socket.id).slice(2, 7);
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('addToChat', playerName + ': ' + data);
        }
    });
    socket.on('evalServer', function (data) {
        if (!DEBUG)
            return;
        var res = eval(data);
        socket.emit('evalAnswer', res);
    });
});
/**
 * Database functions. Global debug is for testing purposes only. cb param = callback.
 */
var DEBUG = true;
var isValidPassword = function (data, cb) {
    db.account.find({ username: data.username, password: data.password }, function (err, res) {
        if (res.length > 0) {
            cb(true);
        }
        else {
            cb(false);
        }
    });
};
var isUsernameTaken = function (data, cb) {
    db.account.find({ username: data.username }, function (err, res) {
        if (res.length > 0) {
            cb(true);
        }
        else {
            cb(false);
        }
    });
};
var addUser = function (data, cb) {
    db.account.insert({ username: data.username, password: data.password }, function (err) {
        cb();
    });
};
// Global player update loop.
setInterval(function () {
    var pack = update();
    // Send locations to each player.
    for (var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit('newPositions', pack);
    }
}, 1000 / 30);
serv.listen(2000, function () {
    console.log('listening on *:2000');
});
