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
        drawBoxesFrames: 60,
        predictionCircleColor: 0x00FF00,
        predictionCircleStyle: 'fill',
        showBoxes: true,
        showPredictionCircle: true
    };

    let settings = Object.assign({}, defaultSettings);

    function onSettingsApplied(newSettings) {
        settings = newSettings;
    }

    function createSettingsProvider() {
        const sp = new SettingsProvider(settings, onSettingsApplied);

        const generalSection = sp.addSection("General Settings");
        generalSection.addSliderField("drawBoxesFrames", "Draw Boxes Frames (FPS)", {
            min: 30,
            max: 230,
            step: 1
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

    function drawBoxes() {
        let myPlayer = Players.get(game.myID);
        if (!myPlayer) return;

        for (let id in Players.all()) {
            let player = Players.get(id);
            if (player && player.status === 0 && !player.me()) {
                if (!player.sprites.box) {
                    player.sprites.box = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.box);
                }
                if (!player.sprites.predictionCircle) {
                    player.sprites.predictionCircle = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.predictionCircle);
                }

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

                if (settings.showPredictionCircle) {
                    player.sprites.predictionCircle.visible = true;
                    if (settings.predictionCircleStyle === 'fill') {
                        player.sprites.predictionCircle.beginFill(settings.predictionCircleColor, 1);
                    } else {
                        player.sprites.predictionCircle.lineStyle(2, settings.predictionCircleColor, 1);
                    }
                    player.sprites.predictionCircle.drawCircle(0, 0, settings.CIRCLE_RADIUS);
                    if (settings.predictionCircleStyle === 'fill') {
                        player.sprites.predictionCircle.endFill();
                    }

                    let predictedPos = {
                        x: player.pos.x + player.speed.x * settings.PREDICTION_DISTANCE,
                        y: player.pos.y + player.speed.y * settings.PREDICTION_DISTANCE
                    };

                    player.sprites.predictionCircle.position.set(predictedPos.x, predictedPos.y);
                } else {
                    player.sprites.predictionCircle.visible = false;
                }
            }
        }
    }

    setInterval(drawBoxes, 1000 / settings.drawBoxesFrames);
})();