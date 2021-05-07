import Scene from 'Scene';
import Patches from 'Patches';
import Reactive from 'Reactive';
import TouchGestures from 'TouchGestures';
import Time from 'Time';
import { height, percentToFocalPlaneX, percentToFocalPlaneY, screenScale, width } from './Screen';

class LogObject {
    value: any;
    count: number;
    constructor(string) {
        this.value = string;
        this.count = 1;
    }

    addCount() {
        this.count++;
    }
}

class SignalObject {
    name: any;
    signal: any;
    constructor(name, signal) {
        this.name = name;
        this.signal = signal;
    }
}

type LoggerConfig = {
    collapse?: boolean;
    maxLines?: number;
}

type StringFunction = (text: string) => void
type NumberFunction = (number: number) => void

export class Logger {
    private startAt: number;
    private scrollStartAt: any;
    private lines: any[];
    private update: any;
    private maxLines: number;
    private text: string;
    private onUpdateTextEvents: StringFunction[];
    private onUpdateProgressEvents: NumberFunction[];
    private collapse: boolean;

    constructor(config: LoggerConfig = { 'collapse': true, 'maxLines': 10 }) {
        this.text = "";
        this.maxLines = config.maxLines;
        this.collapse = config.collapse;
        this.startAt = 0;
        this.scrollStartAt = 0;
        this.lines = [];
        this.update;
        this.onUpdateTextEvents = [];
        this.onUpdateProgressEvents = [];
    }

    private get progress() {
        return this.scrollStartAt / this.scrollBottomPosition;
    }

    private get scrollBottomPosition() {
        return (Math.max(this.lines.length, this.maxLines) - this.maxLines) * -1;
    }

    setMaxLine(value: number);
    setMaxLine(value: ScalarSignal);
    setMaxLine(value: number | ScalarSignal) {
        if (typeof value == 'number') {
            this.maxLines = value;
            this.refreshConsole();
        } else {
            value.monitor({ fireOnInitialValue: true }).select('newValue').subscribe(v => {
                this.maxLines = v;
                this.refreshConsole();
            });
        }
    }

    onUpdateText(callback: StringFunction) {
        this.onUpdateTextEvents.push(callback);
    }

    onUpdateProgress(callback: NumberFunction) {
        this.onUpdateProgressEvents.push(callback);
    }

    log(string) {
        switch (typeof string) {
            case "number":
            case "string":
            case "boolean":
                if (this.collapse) {
                    for (var i = 0; i < this.lines.length; i++) {
                        if (this.lines[i] instanceof LogObject) {
                            if (this.lines[i].value == string) {
                                this.lines[i].addCount();
                                this.refreshConsole();
                                return;
                            }
                        }
                    }
                }
                var log = new LogObject(string);
                this.lines.push(log);
                this.refreshConsole();
                break;
            case "object":
                var log = new LogObject("[object]");
                this.lines.push(log);
                this.refreshConsole();
                break;
            case "function":
                try {
                    string.pinLastValue();
                    var log = new LogObject(string.pinLastValue());
                    this.lines.push(log);
                    this.refreshConsole();
                } catch (err) {
                    var log = new LogObject("[function]");
                    this.lines.push(log);
                    this.refreshConsole();
                }
                break;
            case "undefined":
                var log = new LogObject("[undefined]");
                this.lines.push(log);
                this.refreshConsole();
                break;
            default:
                var log = new LogObject("[type not found]");
                this.lines.push(log);
                this.refreshConsole();
                break;
        }
    }

    watch(name, signal) {
        if (typeof signal.pinLastValue == "function") {
            try {
                signal.pinLastValue();
                const log = new SignalObject(name, signal);
                this.lines.push(log);

                this.refreshConsole();

                if (this.update == null) {
                    this.update = Time.ms.monitor().subscribe(() => this.refreshConsole());
                }
            } catch (err) {
                const log = new LogObject(name + ": [not a signal]");
                this.lines.push(log);
                this.refreshConsole();
            }

        } else {
            const log = new LogObject(name + ": [not a signal]");
            this.lines.push(log);
            this.refreshConsole();
        }
    }

    clear() {
        this.text = "";
        this.scrollStartAt = 0;
        this.lines = [];
        this.startAt = 0;
        this.onUpdateTextEvents.forEach(e => e(this.text));
        this.onUpdateProgressEvents.forEach(e => e(this.progress));
    }

    scrollToTop() {
        this.scrollStartAt = 0;
        this.refreshConsole();
    }

    scrollUp() {
        this.scrollStartAt++;
        this.scrollStartAt = Math.min(0, this.scrollStartAt);
        this.refreshConsole();
    }

    scrollDown() {
        this.scrollStartAt--;
        this.scrollStartAt = Math.max(this.scrollStartAt, this.scrollBottomPosition);
        this.refreshConsole();
    }

    scrollToBottom() {
        this.scrollStartAt = this.scrollBottomPosition;
        this.refreshConsole();
    }

    private refreshConsole() {
        const moreThenMaxLine = this.lines.length > this.maxLines;

        this.startAt = moreThenMaxLine ? this.lines.length - this.maxLines : 0;
        this.text = "";

        for (let i = moreThenMaxLine ? this.maxLines - 1 : this.lines.length - 1; i >= 0; i--) {

            let index = i + this.startAt;
            if (this.scrollStartAt != null) {
                index += this.scrollStartAt;
            }

            if (this.lines[index] instanceof LogObject) {
                const count = this.lines[index].count <= 1 ? "" : `[${this.lines[index].count}]`;
                this.text += `> ${count} ${this.lines[index].value} \n`;
            } else if (this.lines[index] instanceof SignalObject) {
                this.text += `${this.lines[index].name}: ${this.lines[index].signal.pinLastValue()} \n`;
            }
        }

        if (!this.lines.some(x => x instanceof SignalObject)) {
            if (this.update != null) {
                this.update.unsubscribe();
                this.update = null;
            }
        }

        this.onUpdateTextEvents.forEach(e => e(this.text));
        this.onUpdateProgressEvents.forEach(e => e(this.progress));
    }
}

export default (async () => {
    const logger = new Logger();
    const loggerUI = await Scene.root.findFirst('LoggerUI') as unknown as BlockSceneRoot;

    if (loggerUI == undefined) {
        return;
    }

    const [
        maxLine,
        onClickClear,
        onClickUp,
        onClickDown,
        onClickBottom,
        onClickTop,
    ] = await Promise.all([
        loggerUI.outputs.getScalar('maxLine'),
        // Because the bug of Spark AR v112, we can't get the pulse output from block.
        // You can try to replace 'Patches' to 'loggerUI' once the bug fixed.
        // So that you won't need to link the output from block to patch.
        Patches.outputs.getPulse('onClickClear'),
        Patches.outputs.getPulse('onClickUp'),
        Patches.outputs.getPulse('onClickDown'),
        Patches.outputs.getPulse('onClickBottom'),
        Patches.outputs.getPulse('onClickTop'),
    ]);

    logger.setMaxLine(maxLine);
    logger.onUpdateText(text => loggerUI.inputs.setString('Content', text));
    logger.onUpdateProgress(value => loggerUI.inputs.setScalar('Progress', value));

    onClickClear.subscribe(() => logger.clear());
    onClickUp.subscribe(() => logger.scrollUp());
    onClickDown.subscribe(() => logger.scrollDown());
    onClickBottom.subscribe(() => logger.scrollToBottom());
    onClickTop.subscribe(() => logger.scrollToTop());

    await moveByPanGesture(loggerUI);

    return logger;
})();


async function moveByPanGesture(dragable) {
    // Check capability
    if (TouchGestures.onPan == undefined) {
        throw 'Please enable "Touch Gestures -> Pan Gesture" in capabilites.';
    }

    const [perX1, perY1] = await Promise.all([
        percentToFocalPlaneX(1),
        percentToFocalPlaneY(1),
    ]);

    TouchGestures.onPan(dragable).subscribe(event => {
        const targetX = remap(event.translation.x.expSmooth(20), 0, width, 0, perX1.mul(screenScale)).add(dragable.transform.x.pinLastValue());
        const targetY = remap(event.translation.y.expSmooth(20), 0, height, 0, perY1.mul(screenScale)).add(dragable.transform.y.pinLastValue());

        dragable.transform.x = targetX;
        dragable.transform.y = targetY;
    });
}

function remap(input, fromMin, fromMax, toMin, toMax) {
    return Reactive.toRange(Reactive.fromRange(input, fromMin, fromMax), toMin, toMax);
}