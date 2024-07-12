(function() {
    if (typeof PIXI === 'undefined' || typeof game === 'undefined') {
        console.error("PIXI or game object not found.");
        return;
    }

    const GOLIATH_BOX_WIDTH = 100;
    const GOLIATH_BOX_HEIGHT = 50;
    const OTHER_BOX_SIZE = 70;
    const PREDICTION_DISTANCE = 36;
    const CIRCLE_RADIUS = 10;
    const AFTER_IMAGE_DURATION = 2000;
    const COLLISION_COLOR_DURATION = 100;
    const AFTER_IMAGE_INTERVAL = 1000;

    let previousPositions = {};
    let previousSpeeds = {};
    let kalmanFilters = {};
    let showBoxes = false;
    let showForAll = false;
    let showForClosest = true;
    let laserVisible = false;
    let laserColor = 0xFF0000;
    let laserLength = 1400;
    let predictionCircleColor = 0x00FF00;
    let predictionCircleStyle = 'fill';
    let lastCollisionTime = 0;
    let lastAfterImageTime = 0;
    let collisionDetected = false;

    window.addEventListener('keydown', function(event) {
        if (event.key === 'L' || event.key === 'l') {
            showBoxes = !showBoxes;
        }
        if (event.key === 'N' || event.key === 'n') {
            showForAll = !showForAll;
        }
        if (event.key === 'O' || event.key === 'o') {
            showForClosest = !showForClosest;
        }
        if (event.key === 'U' || event.key === 'u') {
            laserVisible = !laserVisible;
        }
        if (event.code === 'Numpad1') {
            laserLength = 800;
        }
        if (event.code === 'Numpad2') {
            laserLength = 1000;
        }
        if (event.code === 'Numpad3') {
            laserLength = 1200;
        }
        if (event.code === 'Numpad4') {
            laserLength = 1400;
        }
        if (event.code === 'Numpad5') {
            laserLength = 2000;
        }
        if (event.key === 'C' || event.key === 'c') {
            predictionCircleColor = (predictionCircleColor === 0x00FF00) ? 0xFF0000 : 0x00FF00;
        }
        if (event.key === 'B' || event.key === 'b') {
            predictionCircleStyle = (predictionCircleStyle === 'fill') ? 'outline' : 'fill';
        }
    });

    function getClosestPlayer() {
        let myPlayer = Players.get(game.myID);
        if (!myPlayer) return null;

        let closestPlayer = null;
        let closestDistance = Infinity;

        for (let id in Players.all()) {
            let player = Players.get(id);
            if (player && player.status === 0 && !player.me()) {
                let distance = Math.sqrt(Math.pow(player.pos.x - myPlayer.pos.x, 2) + Math.pow(player.pos.y - myPlayer.pos.y, 2));
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPlayer = player;
                }
            }
        }

        return closestPlayer;
    }

    function KalmanFilter() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.P = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
        this.R = [[0.01, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]];
        this.Q = [[0.01, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]]; // Further decreased Q values for faster responsiveness
        this.H = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    }

    KalmanFilter.prototype.predict = function() {
        this.x += this.vx;
        this.y += this.vy;
        this.P[0][0] += this.Q[0][0];
        this.P[1][1] += this.Q[1][1];
    }

    KalmanFilter.prototype.update = function(z) {
        let y = [z[0] - this.x, z[1] - this.y];
        let S = [[this.P[0][0] + this.R[0][0], this.P[0][1] + this.R[0][1]], [this.P[1][0] + this.R[1][0], this.P[1][1] + this.R[1][1]]];
        let K = [[this.P[0][0] / S[0][0], this.P[0][1] / S[0][1]], [this.P[1][0] / S[1][0], this.P[1][1] / S[1][1]]];
        this.x += K[0][0] * y[0];
        this.y += K[1][1] * y[1];
        this.P[0][0] *= (1 - K[0][0]);
        this.P[1][1] *= (1 - K[1][1]);
    }

    function interpolateBezier(points, t) {
        let x = Math.pow(1 - t, 2) * points[0].x + 2 * (1 - t) * t * points[1].x + Math.pow(t, 2) * points[2].x;
        let y = Math.pow(1 - t, 2) * points[0].y + 2 * (1 - t) * t * points[1].y + Math.pow(t, 2) * points[2].y;
        return { x: x, y: y };
    }

    function multiStepPrediction(player, steps) {
        let predictedPositions = [];
        let dt = 0.1; // Reduced time step for more frequent predictions
        let predictedPos = { x: player.pos.x, y: player.pos.y };
        for (let i = 0; i < steps; i++) {
            predictedPos.x += player.speed.x * dt;
            predictedPos.y += player.speed.y * dt;
            predictedPositions.push({ x: predictedPos.x, y: predictedPos.y });
        }
        return predictedPositions;
    }

    function drawBoxes() {
        let myPlayer = Players.get(game.myID);
        let myTeam = myPlayer ? myPlayer.team : null;
        let closestPlayer = showForClosest ? getClosestPlayer() : null;

        for (let id in Players.all()) {
            let player = Players.get(id);
            if (player) {
                if (player.status !== 0 || player.me() || (showForClosest && player !== closestPlayer)) {
                    if (player.sprites.box) {
                        player.sprites.box.clear();
                        player.sprites.box.visible = false;
                    }
                    if (player.sprites.predictionCircle) {
                        player.sprites.predictionCircle.clear();
                        player.sprites.predictionCircle.visible = false;
                    }
                    continue;
                }

                if (!showForAll && player.team === myTeam) {
                    if (player.sprites.box) {
                        player.sprites.box.visible = false;
                    }
                    if (player.sprites.predictionCircle) {
                        player.sprites.predictionCircle.visible = false;
                    }
                    continue;
                }

                if (!player.sprites.box) {
                    player.sprites.box = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.box);
                }
                if (!player.sprites.predictionCircle) {
                    player.sprites.predictionCircle = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.predictionCircle);
                }

                if (!previousPositions[id]) {
                    previousPositions[id] = { x: player.pos.x, y: player.pos.y };
                }
                if (!previousSpeeds[id]) {
                    previousSpeeds[id] = { x: player.speed.x, y: player.speed.y };
                }
                if (!kalmanFilters[id]) {
                    kalmanFilters[id] = new KalmanFilter();
                }

                kalmanFilters[id].predict();
                kalmanFilters[id].update([player.pos.x, player.pos.y]);

                let kalmanPosX = kalmanFilters[id].x;
                let kalmanPosY = kalmanFilters[id].y;

                previousPositions[id].x += (player.pos.x - previousPositions[id].x) * 0.7; // Further increased smoothing factor
                previousPositions[id].y += (player.pos.y - previousPositions[id].y) * 0.7;

                player.sprites.box.clear();
                player.sprites.predictionCircle.clear();

                if (showBoxes) {
                    player.sprites.box.visible = true;
                    player.sprites.box.lineStyle(2, 0xFF0000, 1);

                    if (player.type === PlaneType.Goliath) {
                        player.sprites.box.drawRect(-GOLIATH_BOX_WIDTH, -GOLIATH_BOX_HEIGHT, 2 * GOLIATH_BOX_WIDTH, 2 * GOLIATH_BOX_HEIGHT);
                    } else {
                        player.sprites.box.drawRect(-OTHER_BOX_SIZE / 2, -OTHER_BOX_SIZE / 2, OTHER_BOX_SIZE, OTHER_BOX_SIZE);
                    }

                    let spritePos = player.sprites.sprite.position;
                    player.sprites.box.position.set(spritePos.x, spritePos.y);
                    player.sprites.box.rotation = player.sprites.sprite.rotation;
                } else {
                    player.sprites.box.visible = false;
                }

                let predictedPos = interpolateBezier([
                    { x: player.pos.x, y: player.pos.y },
                    { x: player.pos.x + player.speed.x * PREDICTION_DISTANCE / 2, y: player.pos.y + player.speed.y * PREDICTION_DISTANCE / 2 },
                    { x: player.pos.x + player.speed.x * PREDICTION_DISTANCE, y: player.pos.y + player.speed.y * PREDICTION_DISTANCE }
                ], 0.5);

                let multiStepPredictions = multiStepPrediction(player, 1000); // Increased steps for further prediction

                if (predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.beginFill(predictionCircleColor, 1);
                } else {
                    player.sprites.predictionCircle.lineStyle(2, predictionCircleColor, 1);
                }
                player.sprites.predictionCircle.drawCircle(0, 0, CIRCLE_RADIUS);
                if (predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.endFill();
                }

                player.sprites.predictionCircle.position.set(predictedPos.x, predictedPos.y);
                player.sprites.predictionCircle.visible = true;

                if (myPlayer && myPlayer.sprites.laser) {
                    let laserStartX = myPlayer.pos.x;
                    let laserStartY = myPlayer.pos.y;
                    let laserEndX = laserStartX + Math.sin(myPlayer.rot) * laserLength;
                    let laserEndY = laserStartY - Math.cos(myPlayer.rot) * laserLength;

                    let distanceToStart = Math.sqrt(Math.pow(predictedPos.x - laserStartX, 2) + Math.pow(predictedPos.y - laserStartY, 2));
                    let distanceToEnd = Math.sqrt(Math.pow(predictedPos.x - laserEndX, 2) + Math.pow(predictedPos.y - laserEndY, 2));
                    let laserLineLength = Math.sqrt(Math.pow(laserEndX - laserStartX, 2) + Math.pow(laserEndY - laserStartY, 2));

                    if (distanceToStart + distanceToEnd <= laserLineLength + CIRCLE_RADIUS) {
                        laserColor = 0x0000FF;

                        if (performance.now() - lastAfterImageTime > AFTER_IMAGE_INTERVAL) {
                            let afterImage = new PIXI.Graphics();
                            afterImage.lineStyle(2, 0x00FF00, 1);
                            afterImage.moveTo(0, 0);
                            afterImage.lineTo(0, -laserLength);
                            afterImage.position.set(laserStartX, laserStartY);
                            afterImage.rotation = myPlayer.rot;
                            game.graphics.layers.playernames.addChild(afterImage);

                            setTimeout(() => {
                                game.graphics.layers.playernames.removeChild(afterImage);
                            }, AFTER_IMAGE_DURATION);

                            lastAfterImageTime = performance.now();
                        }

                        setTimeout(() => {
                            laserColor = 0xFF0000;
                        }, COLLISION_COLOR_DURATION);

                        lastCollisionTime = performance.now();
                    }
                }
            }
        }
    }

    function createLaser() {
        let myPlayer = Players.get(game.myID);
        if (!myPlayer) {
            return;
        }

        if (!myPlayer.sprites.laser) {
            myPlayer.sprites.laser = new PIXI.Graphics();
            game.graphics.layers.playernames.addChild(myPlayer.sprites.laser);
        }

        myPlayer.sprites.laser.clear();
        myPlayer.sprites.laser.lineStyle(2, laserColor, laserVisible ? 1 : 0);
        myPlayer.sprites.laser.moveTo(0, 0);
        myPlayer.sprites.laser.lineTo(0, -laserLength);

        let spritePos = myPlayer.sprites.sprite.position;
        myPlayer.sprites.laser.position.set(spritePos.x, spritePos.y);
        myPlayer.sprites.laser.rotation = myPlayer.sprites.sprite.rotation;
    }

    setInterval(drawBoxes, 16);
    setInterval(createLaser, 16);
})();
