(function () {
    if (typeof PIXI === 'undefined' || typeof game === 'undefined') {
        console.error("PIXI or game object not found.");
        return;
    }

    const defaultSettings = {
        GOLIATH_BOX_WIDTH: 100,
        GOLIATH_BOX_HEIGHT: 50,
        OTHER_BOX_SIZE: 70,
        PREDICTION_DISTANCE: 36,
        CIRCLE_RADIUS: 10,
        AFTER_IMAGE_DURATION: 2000,
        COLLISION_COLOR_DURATION: 100,
        AFTER_IMAGE_INTERVAL: 1000,
        smoothingFactor: 0.7,
        multiStepPredictions: 50,
        drawBoxesFrames: 60,
        createLaserFrames: 60,
        dt: 0.1,
        laserColor: 0xFF0000,
        collisionColor: 0x0000FF,
        afterImageColor: 0x00FF00,
        predictionCircleColor: 0x00FF00,
        predictionCircleStyle: 'fill',
        showBoxes: false,
        showForAll: false,
        showForClosest: true,
        laserVisible: false,
        keyBindings: {
            toggleBoxes: 'L',
            toggleShowForAll: 'N',
            toggleShowForClosest: 'O',
            toggleLaser: 'U',
            laserLength1: 'Numpad1',
            laserLength2: 'Numpad2',
            laserLength3: 'Numpad3',
            laserLength4: 'Numpad4',
            laserLength5: 'Numpad5',
            togglePredictionCircleColor: 'C',
            togglePredictionCircleStyle: 'B'
        }
    };

    let settings = Object.assign({}, defaultSettings);

    function onSettingsApplied(newSettings) {
        settings = newSettings;
    }

    function createSettingsProvider() {
        const sp = new SettingsProvider(settings, onSettingsApplied);

        const generalSection = sp.addSection("General Settings");
        generalSection.addSliderField("smoothingFactor", "Smoothing Factor", {
            min: 0.0,
            max: 2.0,
            step: 0.1
        });
        generalSection.addSliderField("multiStepPredictions", "Multi-Step Predictions", {
            min: 0,
            max: 1000,
            step: 1
        });
        generalSection.addSliderField("drawBoxesFrames", "Draw Boxes Frames (FPS)", {
            min: 30,
            max: 230,
            step: 1
        });
        generalSection.addSliderField("createLaserFrames", "Create Laser Frames (FPS)", {
            min: 30,
            max: 230,
            step: 1
        });
        generalSection.addSliderField("dt", "Prediction Time Step (dt)", {
            min: 0.0,
            max: 3.0,
            step: 0.1
        });

        const circleSettingsSection = sp.addSection("Prediction Circle Settings");
        circleSettingsSection.addSliderField("CIRCLE_RADIUS", "Circle Radius", {
            min: 1,
            max: 50,
            step: 1
        });
        circleSettingsSection.addString("predictionCircleColor", "Prediction Circle Color");
        circleSettingsSection.addValuesField("predictionCircleStyle", "Prediction Circle Style", {
            "fill": "Fill",
            "outline": "Outline"
        });

        const keyBindingsSection = sp.addSection("Key Bindings");
        keyBindingsSection.addString("keyBindings.toggleBoxes", "Toggle Boxes Key");
        keyBindingsSection.addString("keyBindings.toggleShowForAll", "Toggle Show For All Key");
        keyBindingsSection.addString("keyBindings.toggleShowForClosest", "Toggle Show For Closest Key");
        keyBindingsSection.addString("keyBindings.toggleLaser", "Toggle Laser Key");
        keyBindingsSection.addString("keyBindings.laserLength1", "Laser Length 800 Key");
        keyBindingsSection.addString("keyBindings.laserLength2", "Laser Length 1000 Key");
        keyBindingsSection.addString("keyBindings.laserLength3", "Laser Length 1200 Key");
        keyBindingsSection.addString("keyBindings.laserLength4", "Laser Length 1400 Key");
        keyBindingsSection.addString("keyBindings.laserLength5", "Laser Length 2000 Key");
        keyBindingsSection.addString("keyBindings.togglePredictionCircleColor", "Toggle Prediction Circle Color Key");
        keyBindingsSection.addString("keyBindings.togglePredictionCircleStyle", "Toggle Prediction Circle Style Key");

        const colorSettingsSection = sp.addSection("Color Settings");
        colorSettingsSection.addString("laserColor", "Laser Color");
        colorSettingsSection.addString("collisionColor", "Collision Color");
        colorSettingsSection.addString("afterImageColor", "After Image Color");

        const resetSection = sp.addSection("Reset to Defaults");
        resetSection.addButton("Reset", {
            click: function () {
                sp.apply(defaultSettings);
            }
        });

        return sp;
    }

    SWAM.registerExtension({
        name: "Aim-Assist",
        id: "predictionAndLaserExtension",
        description: "Extension with customizable settings for predictions and lasers",
        author: "Monarch",
        version: "1.0",
        settingsProvider: createSettingsProvider()
    });

    let previousPositions = {};
    let previousSpeeds = {};
    let kalmanFilters = {};
    let lastCollisionTime = 0;
    let lastAfterImageTime = 0;
    let collisionDetected = false;

    window.addEventListener('keydown', function (event) {
        if (event.key === settings.keyBindings.toggleBoxes) {
            settings.showBoxes = !settings.showBoxes;
        }
        if (event.key === settings.keyBindings.toggleShowForAll) {
            settings.showForAll = !settings.showForAll;
        }
        if (event.key === settings.keyBindings.toggleShowForClosest) {
            settings.showForClosest = !settings.showForClosest;
        }
        if (event.key === settings.keyBindings.toggleLaser) {
            settings.laserVisible = !settings.laserVisible;
        }
        if (event.code === settings.keyBindings.laserLength1) {
            settings.laserLength = 800;
        }
        if (event.code === settings.keyBindings.laserLength2) {
            settings.laserLength = 1000;
        }
        if (event.code === settings.keyBindings.laserLength3) {
            settings.laserLength = 1200;
        }
        if (event.code === settings.keyBindings.laserLength4) {
            settings.laserLength = 1400;
        }
        if (event.code === settings.keyBindings.laserLength5) {
            settings.laserLength = 2000;
        }
        if (event.key === settings.keyBindings.togglePredictionCircleColor) {
            settings.predictionCircleColor = (settings.predictionCircleColor === 0x00FF00) ? 0xFF0000 : 0x00FF00;
        }
        if (event.key === settings.keyBindings.togglePredictionCircleStyle) {
            settings.predictionCircleStyle = (settings.predictionCircleStyle === 'fill') ? 'outline' : 'fill';
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
        this.Q = [[0.01, 0, 0, 0], [0, 0.01, 0, 0], [0, 0, 0.01, 0], [0, 0, 0, 0.01]];
        this.H = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    }

    KalmanFilter.prototype.predict = function () {
        this.x += this.vx;
        this.y += this.vy;
        this.P[0][0] += this.Q[0][0];
        this.P[1][1] += this.Q[1][1];
    }

    KalmanFilter.prototype.update = function (z) {
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
        let dt = settings.dt;
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
        let closestPlayer = settings.showForClosest ? getClosestPlayer() : null;

        for (let id in Players.all()) {
            let player = Players.get(id);
            if (player) {
                if (player.status !== 0 || player.me() || (settings.showForClosest && player !== closestPlayer)) {
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

                if (!settings.showForAll && player.team === myTeam) {
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

                previousPositions[id].x += (player.pos.x - previousPositions[id].x) * settings.smoothingFactor;
                previousPositions[id].y += (player.pos.y - previousPositions[id].y) * settings.smoothingFactor;

                player.sprites.box.clear();
                player.sprites.predictionCircle.clear();

                if (settings.showBoxes) {
                    player.sprites.box.visible = true;
                    player.sprites.box.lineStyle(2, 0xFF0000, 1);

                    if (player.type === PlaneType.Goliath) {
                        player.sprites.box.drawRect(-settings.GOLIATH_BOX_WIDTH, -settings.GOLIATH_BOX_HEIGHT, 2 * settings.GOLIATH_BOX_WIDTH, 2 * settings.GOLIATH_BOX_HEIGHT);
                    } else {
                        player.sprites.box.drawRect(-settings.OTHER_BOX_SIZE / 2, -settings.OTHER_BOX_SIZE / 2, settings.OTHER_BOX_SIZE, settings.OTHER_BOX_SIZE);
                    }

                    let spritePos = player.sprites.sprite.position;
                    player.sprites.box.position.set(spritePos.x, spritePos.y);
                    player.sprites.box.rotation = player.sprites.sprite.rotation;
                } else {
                    player.sprites.box.visible = false;
                }

                let predictedPos = interpolateBezier([
                    { x: player.pos.x, y: player.pos.y },
                    { x: player.pos.x + player.speed.x * settings.PREDICTION_DISTANCE / 2, y: player.pos.y + player.speed.y * settings.PREDICTION_DISTANCE / 2 },
                    { x: player.pos.x + player.speed.x * settings.PREDICTION_DISTANCE, y: player.pos.y + player.speed.y * settings.PREDICTION_DISTANCE }
                ], 0.5);

                let multiStepPredictions = multiStepPrediction(player, settings.multiStepPredictions);

                if (settings.predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.beginFill(settings.predictionCircleColor, 1);
                } else {
                    player.sprites.predictionCircle.lineStyle(2, settings.predictionCircleColor, 1);
                }
                player.sprites.predictionCircle.drawCircle(0, 0, settings.CIRCLE_RADIUS);
                if (settings.predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.endFill();
                }

                player.sprites.predictionCircle.position.set(predictedPos.x, predictedPos.y);
                player.sprites.predictionCircle.visible = true;

                if (myPlayer && myPlayer.sprites.laser) {
                    let laserStartX = myPlayer.pos.x;
                    let laserStartY = myPlayer.pos.y;
                    let laserEndX = laserStartX + Math.sin(myPlayer.rot) * settings.laserLength;
                    let laserEndY = laserStartY - Math.cos(myPlayer.rot) * settings.laserLength;

                    let distanceToStart = Math.sqrt(Math.pow(predictedPos.x - laserStartX, 2) + Math.pow(predictedPos.y - laserStartY, 2));
                    let distanceToEnd = Math.sqrt(Math.pow(predictedPos.x - laserEndX, 2) + Math.pow(predictedPos.y - laserEndY, 2));
                    let laserLineLength = Math.sqrt(Math.pow(laserEndX - laserStartX, 2) + Math.pow(laserEndY - laserStartY, 2));

                    if (distanceToStart + distanceToEnd <= laserLineLength + settings.CIRCLE_RADIUS) {
                        settings.laserColor = settings.collisionColor;

                        if (performance.now() - lastAfterImageTime > settings.AFTER_IMAGE_INTERVAL) {
                            let afterImage = new PIXI.Graphics();
                            afterImage.lineStyle(2, settings.afterImageColor, 1);
                            afterImage.moveTo(0, 0);
                            afterImage.lineTo(0, -settings.laserLength);
                            afterImage.position.set(laserStartX, laserStartY);
                            afterImage.rotation = myPlayer.rot;
                            game.graphics.layers.playernames.addChild(afterImage);

                            setTimeout(() => {
                                game.graphics.layers.playernames.removeChild(afterImage);
                            }, settings.AFTER_IMAGE_DURATION);

                            lastAfterImageTime = performance.now();
                        }

                        setTimeout(() => {
                            settings.laserColor = 0xFF0000;
                        }, settings.COLLISION_COLOR_DURATION);

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
        myPlayer.sprites.laser.lineStyle(2, settings.laserColor, settings.laserVisible ? 1 : 0);
        myPlayer.sprites.laser.moveTo(0, 0);
        myPlayer.sprites.laser.lineTo(0, -settings.laserLength);

        let spritePos = myPlayer.sprites.sprite.position;
        myPlayer.sprites.laser.position.set(spritePos.x, spritePos.y);
        myPlayer.sprites.laser.rotation = myPlayer.sprites.sprite.rotation;
    }

    setInterval(drawBoxes, 1000 / settings.drawBoxesFrames);
    setInterval(createLaser, 1000 / settings.createLaserFrames);
})();