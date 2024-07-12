(function() {
    // Ensure PIXI and game are defined
    if (typeof PIXI === 'undefined' || typeof game === 'undefined') {
        console.error("PIXI or game object not found.");
        return;
    }

    const GOLIATH_BOX_WIDTH = 100;
    const GOLIATH_BOX_HEIGHT = 50;
    const OTHER_BOX_SIZE = 70;  // Slightly bigger box for other plane types
    const PREDICTION_DISTANCE = 36; // Closer distance ahead for the prediction circle
    const CIRCLE_RADIUS = 10; // Radius of the prediction circle
    const SMOOTHING_FACTOR = 0.1;  // Adjust the smoothing factor as needed

    // Store previous positions for interpolation
    let previousPositions = {};
    let showBoxes = true; // Flag to toggle the visibility of boxes
    let showForAll = false; // Flag to toggle showing for all players
    let predictionCircleColor = 0x00FF00; // Default color: Green
    let predictionCircleStyle = 'fill'; // Default style: fill

    // Event listener for key press to toggle boxes and other options
    window.addEventListener('keydown', function(event) {
        if (event.key === 'L' || event.key === 'l') {
            showBoxes = !showBoxes; // Toggle the flag
        }
        if (event.key === 'N' || event.key === 'n') {
            showForAll = !showForAll; // Toggle showing for all players
        }
        // Change prediction circle color with 'C' key
        if (event.key === 'C' || event.key === 'c') {
            predictionCircleColor = (predictionCircleColor === 0x00FF00) ? 0xFF0000 : 0x00FF00; // Toggle between Green and Red
        }
        // Change prediction circle style with 'B' key
        if (event.key === 'B' || event.key === 'b') {
            predictionCircleStyle = (predictionCircleStyle === 'fill') ? 'outline' : 'fill'; // Toggle between fill and outline
        }
    });

    function drawBoxes() {
        // Dynamically get the current player's team
        let myPlayer = Players.get(game.myID);
        let myTeam = myPlayer ? myPlayer.team : null;

        for (let id in Players.all()) {
            let player = Players.get(id);
            if (player && player.status === 0 && !player.me()) {
                // Check if we should show boxes for this player
                if (!showForAll && player.team === myTeam) {
                    // Hide boxes and prediction circles for teammates if showForAll is false
                    if (player.sprites.box) {
                        player.sprites.box.visible = false;
                    }
                    if (player.sprites.predictionCircle) {
                        player.sprites.predictionCircle.visible = false;
                    }
                    continue; // Skip teammates
                }

                if (!player.sprites.box) {
                    player.sprites.box = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.box);
                }
                if (!player.sprites.predictionCircle) {
                    player.sprites.predictionCircle = new PIXI.Graphics();
                    game.graphics.layers.playernames.addChild(player.sprites.predictionCircle);
                }

                // Initialize previous positions if they don't exist
                if (!previousPositions[id]) {
                    previousPositions[id] = { x: player.pos.x, y: player.pos.y };
                }

                // Interpolate positions
                previousPositions[id].x += (player.pos.x - previousPositions[id].x) * SMOOTHING_FACTOR;
                previousPositions[id].y += (player.pos.y - previousPositions[id].y) * SMOOTHING_FACTOR;

                player.sprites.box.clear();
                player.sprites.predictionCircle.clear();

                if (showBoxes) {
                    player.sprites.box.visible = true;
                    player.sprites.box.lineStyle(2, 0xFF0000, 1); // Red box

                    // Special handling for Goliath ship type
                    if (player.type === PlaneType.Goliath) {
                        player.sprites.box.drawRect(
                            -GOLIATH_BOX_WIDTH, -GOLIATH_BOX_HEIGHT, 2 * GOLIATH_BOX_WIDTH, 2 * GOLIATH_BOX_HEIGHT
                        );
                    } else {
                        player.sprites.box.drawRect(
                            -OTHER_BOX_SIZE / 2, -OTHER_BOX_SIZE / 2, OTHER_BOX_SIZE, OTHER_BOX_SIZE
                        );
                    }

                    // Set the position of the box to be centered on the player's sprite
                    let spritePos = player.sprites.sprite.position;
                    player.sprites.box.position.set(spritePos.x, spritePos.y);

                    // Set the rotation of the box to match the player's rotation
                    player.sprites.box.rotation = player.sprites.sprite.rotation;
                } else {
                    player.sprites.box.visible = false;
                }

                // Calculate the predicted position
                let predictedPosX = player.pos.x + player.speed.x * PREDICTION_DISTANCE;
                let predictedPosY = player.pos.y + player.speed.y * PREDICTION_DISTANCE;

                // Draw the prediction circle
                if (predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.beginFill(predictionCircleColor, 1);
                } else {
                    player.sprites.predictionCircle.lineStyle(2, predictionCircleColor, 1);
                }
                player.sprites.predictionCircle.drawCircle(0, 0, CIRCLE_RADIUS);
                if (predictionCircleStyle === 'fill') {
                    player.sprites.predictionCircle.endFill();
                }

                // Set the position of the prediction circle
                player.sprites.predictionCircle.position.set(predictedPosX, predictedPosY);
                player.sprites.predictionCircle.visible = true;
            }
        }
    }

    // Update the boxes' and prediction circles' positions at regular intervals
    setInterval(drawBoxes, 16); // 60 FPS, adjust the interval as needed
})();
