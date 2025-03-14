{
    init: function(elevators, floors) {
        const queueUp = [];
        const queueDown = [];

        floors.forEach(_ => {
            queueUp.push(0);
            queueDown.push(0);
        });

        floors.forEach(floor => {
            floor.on("up_button_pressed", function() {
                lf("Up pressed", floor.floorNum());
                callElevatorAndQueue(floor.floorNum(), "up");
            });

            floor.on("down_button_pressed", function() {
                lf("Down pressed", floor.floorNum());
                callElevatorAndQueue(floor.floorNum(), "down");
            });
        });

        elevators.forEach(elevator => {
            elevator.on("floor_button_pressed", function(floorNum) {
                le("" + floorNum + " pressed", elevator);
                scheduleFloor(elevator, floorNum);
            });

            elevator.on("passing_floor", function(floorNum, direction) {
                le("Passing " + floorNum, elevator);
                const drop = elevator.getPressedFloors().includes(floorNum);
                const pick = hasQueue(floorNum, direction) && elevator.loadFactor() < 0.8; // && anotherOneWillComeTo(elevator, floorNum);
                if (drop || pick) {
                    clearDestination(elevator, floorNum);
                    elevator.goToFloor(floorNum, true);
                    clearQueue(floorNum, direction);
                }
            });

            elevator.on("stopped_at_floor", function(floorNum) {
                le("Stopped at " + floorNum, elevator);
                const direction = getDirection(elevator);
                clearQueue(floorNum, direction === "stopped" ? "both" : direction);
                setDestinationLights(elevator, direction);
            });

            elevator.on("idle", function(floorNum) {
                le("Idle at " + floorNum, elevator);
                if (!goToNearestPressedFloor(elevator)) {
                    goToNearestCall(elevator);
                }
            });
        });

        function callElevatorAndQueue(floorNum, direction) {
            queueForElevator(floorNum, direction);
            callElevator(floorNum, direction);
        }

        function callElevator(floorNum, direction) {
            if (!isElevatorComing(floorNum, direction)) {
                if (!extendElevatorDestination(floorNum, direction)) {
                    return callIdleElevator(floorNum);
                } else {
                    return true;
                }
            }
            return false;
        }

        function isElevatorComing(floorNum, direction) {
            direction = flipAtEnds(floorNum, direction);
            const candidates = getIncomingElevators(floorNum, direction);
            lf("Elevator is coming: " + (candidates.length > 0), floorNum);
            return candidates.length > 0;
        }

        function extendElevatorDestination(floorNum, direction) {
            direction = flipAtEnds(floorNum, direction);
            const candidates = getIncomingElevators(floorNum, direction, true);
            const candidate = getClosestElevator(candidates, floorNum);
            if (candidate) {
                scheduleFloor(candidate, floorNum, direction);
                lf("Elevator destination extended: " + (candidates.destinationQueue), floorNum);
                return true;
            } else {
                return false;
            }
        }

        function callIdleElevator(floorNum) {
            const candidates = elevators.filter(elevator => elevator.destinationQueue.length === 0);
            const candidate = getClosestElevator(candidates, floorNum);
            if (candidate) {
                scheduleFloor(candidate, floorNum);
                lf("Idle elevator called: " + (candidate.currentFloor()), floorNum);
                return true;
            } else {
                return false;
            }
        }

        function getClosestElevator(elevators, floorNum) {
            return elevators.sort((e1, e2) => elevatorDistance(e1, floorNum) < elevatorDistance(e2, floorNum))[0];
        }

        function elevatorDistance(elevator, floorNum) {
            return Math.abs(elevator.currentFloor() - floorNum);
        }

        function flipAtEnds(floorNum, direction) {
            if (isTopOrBottom(floorNum)) {
                direction = flipDirection(direction);
            }
            return direction;
        }

        function isTopOrBottom(floorNum) {
            return floorNum === 0 || floorNum === floors.length - 1;
        }

        function flipDirection(direction) {
            if (direction === "up") return "down";
            else if (direction === "down") return "up";
        }

        function getIncomingElevators(floorNum, direction, halfWay = false) {
            return elevators
                .filter(elevator => elevator.destinationDirection() === direction)
                .filter(elevator => isComingTowards(elevator, direction, floorNum, halfWay));
        }

        function isComingTowards(elevator, floorNum, halfWay = false) {
            const destination = getDestination(elevator);

            if (!destination) return false;

            const currentFloor = elevator.currentFloor();
            const direction = elevator.destinationDirection();
            return (direction === "up" && currentFloor < floorNum && (halfWay || destination >= floorNum)) ||
                (direction === "down" && currentFloor > floorNum && (halfWay || destination <= floorNum));
        }

        function getDestination(elevator) {
            const direction = elevator.destinationDirection();
            if (direction === "up") {
                return Math.max(...elevator.destinationQueue);
            } else if (direction === "down") {
                return Math.min(...elevator.destinationQueue);
            } else {
                return undefined;
            }
        }

        function anotherOneWillComeTo(elevator, floorNum) {
            return elevators.find(e => e != elevator && willComeTo(e, floorNum));
        }

        function willComeTo(elevator, floorNum) {
            const queue = elevator.destinationQueue;
            const currentFloor = elevator.currentFloor();
            const min = Math.min(...queue);
            const max = Math.max(...queue);
            return min === floorNum || max === floorNum || 
                (currentFloor < floorNum && floorNum < max) ||
                (currentFloor > floorNum && floorNum > min);
        }

        function queueForElevator(floorNum, direction) {
            if (direction === "up") {
                queueUp[floorNum]++;
            } else if (direction === "down") {
                queueDown[floorNum]++;
            }
            lf("Queued for elevator: " + direction, floorNum);
        }

        function hasQueue(floorNum, direction) {
            if (direction == "up") {
                return queueUp[floorNum] > 0;
            } else if (direction === "down") {
                return queueDown[floorNum] > 0;
            } else if (direction === "any") {
                return queueUp[floorNum] > 0 || queueDown[floorNum] > 0;
            } else {
                return false;
            }
        }

        function clearQueue(floorNum, direction) {
            if (direction == "up") {
                queueUp[floorNum] = 0;
            } else if (direction === "down") {
                queueDown[floorNum] = 0;
            } else if (direction === "both") {
                queueUp[floorNum] = 0;
                queueDown[floorNum] = 0;
            }
        }

        function clearDestination(elevator, floorNum) {
            let queue = elevator.destinationQueue;
            if (queue.includes(floorNum)) {
                queue = queue.filter(floor => floor !== floorNum);
                elevator.destinationQueue = queue;
                elevator.checkDestinationQueue();
            }
        }

        function goToNearestPressedFloor(elevator) {
            const pressedFloors = elevator.getPressedFloors();

            if (pressedFloors.length === 0) return false;

            const currentFloor = elevator.currentFloor();
            let aboveCount = 0;
            let belowCount = 0;

            pressedFloors.forEach(floorNum => {
                if (floorNum > currentFloor) {
                    aboveCount += floorNum - currentFloor;
                } else {
                    belowCount += currentFloor - floorNum;
                }
            });

            // Drop the minority and come back. Save time.
            if (aboveCount > belowCount) {
                elevator.goToFloor(Math.min(pressedFloors));
            } else {
                elevator.goToFloor(Math.max(pressedFloors));
            }

            return true;
        }

        function goToNearestCall(elevator) {
            const currentFloor = elevator.currentFloor();
            const queuedFloors = [];

            for (let i = 0; i < floors.length; i++) {
                if (hasQueue(i, "any") && !elevators.find(e => willComeTo(e, i))) {
                    queuedFloors.push(i);
                }
            }

            if (queuedFloors.length === 0) {
                return;
            }

            // Pick the minority and come back. Save time.
            let min = Math.min(...queuedFloors);
            let max = Math.max(...queuedFloors);
            const aboveDistance = Math.abs(currentFloor - max);
            const belowDistance = Math.abs(currentFloor - min);
            if (aboveDistance > belowDistance) {
                elevator.goToFloor(min);
            } else if (aboveDistance < belowDistance) {
                elevator.goToFloor(max);
            } else if (Math.random() < 0.5) {
                elevator.goToFloor(min);
            } else {
                elevator.goToFloor(max);
            }
        }

        function getDirection(elevator) {
            const destination = elevator.destinationQueue[0];

            if (!destination) return "stopped";

            const currentFloor = elevator.currentFloor();

            if (currentFloor < destination) {
                return "up";
            } else if (currentFloor > destination) {
                return "down";
            }
        }

        function setDestinationLights(elevator, direction) {
            elevator.goingUpIndicator(true);
            elevator.goingDownIndicator(true);

            if (direction === "up") {
                elevator.goingDownIndicator(false);
            } else if (direction === "down") {
                elevator.goingUpIndicator(false);
            }
        }

        function scheduleFloor(elevator, floorNum, calledDirection) {
            const queue = elevator.destinationQueue;
            let insertIndex = 0;

            // Simulating
            for (let currentFloor = elevator.currentFloor(),
                 direction = elevator.destinationDirection() === "up" ? 1 : -1;
                 insertIndex < queue.length;
                 currentFloor += direction, insertIndex++) {
                if (queue[insertIndex] === floorNum) return; // Floor is already scheduled at the right place

                if (currentFloor === floorNum && (!calledDirection || calledDirection === direction)) break; // We will schedule the floor at this place

                if (currentFloor === 0) direction = 1;
                if (currentFloor === floors.length - 1) direction = -1;
            }

            queue.splice(insertIndex, 0, floorNum);
            elevator.checkDestinationQueue();
        }

        function lf(message, floorNum) {
            l("Floor-" + floorNum + ": " + message);
        }

        function le(message, elevator) {
            l("ElevatorAt-" + elevator.currentFloor() + "-" + elevator.destinationDirection() + "[" + elevator.destinationQueue + "]: " + message);
        }

        function l(message) {
            //console.log(message);
            // alert();
        }
    },
        update: function(dt, elevators, floors) {
            // We normally don't need to do anything here
        }
}