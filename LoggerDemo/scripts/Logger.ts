import Scene from 'Scene';
import Reactive from 'Reactive';
import Diagnostics from 'Diagnostics';
import TouchGestures from 'TouchGestures';
import { invokeThenAsync, remap } from './ReactiveUtility';
import { height, percentToFocalPlaneX, percentToFocalPlaneY, width } from './Screen';

// e.g. 13:01:04
const timestamp = () => {
    const HH = ('0' + new Date().getHours()).slice(-2);
    const mm = ('0' + new Date().getMinutes()).slice(-2);
    const ss = ('0' + new Date().getSeconds()).slice(-2);
    return `${HH}:${mm}:${ss}`;
};

async function moveByPanGesture(dragable) {
    const [perX1, perY1] = await Promise.all([
        percentToFocalPlaneX(Reactive.val(1)),
        percentToFocalPlaneY(Reactive.val(1)),
    ]);

    TouchGestures.onPan(dragable).subscribe(event => {
        const targetX = remap(event.translation.x.expSmooth(20), 0, width, 0, perX1.mul(2)).add(dragable.transform.x.pinLastValue());
        const targetY = remap(event.translation.y.expSmooth(20), 0, height, 0, perY1.mul(2)).add(dragable.transform.y.pinLastValue());

        dragable.transform.x = targetX;
        dragable.transform.y = targetY;
    });
}

interface ILogObject {
    getContent(enableTimestamp: boolean): string;
}

class LogObject implements ILogObject {
    value: number | string | boolean;
    count: number;
    time: string;
    constructor(string: number | string | boolean) {
        this.value = string;
        this.count = 1;
        this.time = timestamp();
    }

    getContent(enableTimestamp): string {
        const count = this.count <= 1 ? "" : `[${this.count}] `;
        const time = enableTimestamp ? `[${this.time}] ` : "";
        return `${time}${count}${this.value} \n`;
    }
}

class SignalObject implements ILogObject {
    name: string;
    value: BoolSignal | ScalarSignal | StringSignal;
    subscription: Subscription;
    constructor(name: string, signal: BoolSignal | ScalarSignal | StringSignal, onUpdate: Function) {
        this.name = name;
        this.subscription = signal.monitor({ fireOnInitialValue: true }).subscribe(v => {
            this.value = v.newValue;
            onUpdate();
        });
    }

    getContent(): string {
        return `${this.name}: ${this.value} \n`;
    }
}

type StringFunction = (text: string) => void
type NumberFunction = (number: number) => void

export class Logger {
    private startAt: number;
    private scrollStartAt: number;
    private lines: ILogObject[];
    private refreshSubscriptions: Subscription[];
    private onUpdateTextEvents: StringFunction[];
    private onUpdateProgressEvents: NumberFunction[];
    private _text: string;
    private _lock: boolean;
    private _maxLine: number;
    private _logTime: boolean;
    printConsole: boolean;

    constructor() {
        this.startAt = 0;
        this.scrollStartAt = 0;
        this.lines = [];
        this.refreshSubscriptions = [];
        this.onUpdateTextEvents = [];
        this.onUpdateProgressEvents = [];
        this._text = '';
        this._lock = false;
        this._maxLine = 10;
        this._logTime = false;
    }

    private get progress() {
        return this.scrollStartAt / this.scrollBottomPosition;
    }

    private get scrollBottomPosition() {
        return (Math.max(this.lines.length, this._maxLine) - this._maxLine) * -1;
    }

    set logTime(value: boolean) {
        this._logTime = value;
        this.refreshConsole();
    }

    get maxLine() {
        return this._maxLine;
    }

    set maxLine(value: number) {
        this._maxLine = value;
        this.refreshConsole();
    }

    get lock() {
        return this._lock;
    }

    set lock(value: boolean) {
        this._lock = value;

        if (!this._lock) {
            this.refreshConsole();
        }
    }

    get text() {
        return this._text;
    }

    onUpdateText(callback: StringFunction) {
        this.onUpdateTextEvents.push(callback);
    }

    onUpdateProgress(callback: NumberFunction) {
        this.onUpdateProgressEvents.push(callback);
    }

    log(content) {
        if (this.printConsole) {
            Diagnostics.log(content)
        }

        switch (typeof content) {
            case "number":
            case "string":
            case "boolean":
                var log = new LogObject(content);
                this.lines.push(log);
                this.refreshConsole();
                break;
            case "object":
                const stringify = JSON.stringify(content);
                var log = new LogObject(stringify === '{}' ? '[object]' : stringify);
                this.lines.push(log);
                this.refreshConsole();
                break;
            case "function":
                try {
                    content.pinLastValue();
                    var log = new LogObject(content.pinLastValue());
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
        if (this.printConsole) {
            Diagnostics.watch(name, signal);
        }

        if (typeof signal.pinLastValue == "function") {
            try {
                signal.pinLastValue();
                const log = new SignalObject(name, signal, () => this.refreshConsole());
                this.lines.push(log);
                this.refreshSubscriptions.push(log.subscription);
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
        this._text = "";
        this.scrollStartAt = 0;
        this.lines = [];
        this.startAt = 0;
        this.onUpdateTextEvents.forEach(e => e(this._text));
        this.onUpdateProgressEvents.forEach(e => e(this.progress));
        this.refreshSubscriptions.forEach(s => s.unsubscribe());
        this.refreshSubscriptions = [];
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
        if (this._lock) {
            return;
        }

        const moreThenMaxLine = this.lines.length > this._maxLine;
        this.startAt = moreThenMaxLine ? this.lines.length - this._maxLine : 0;
        this._text = "";

        for (let i = moreThenMaxLine ? this._maxLine - 1 : this.lines.length - 1; i >= 0; i--) {
            const index = i + this.startAt + this.scrollStartAt;
            this._text += this.lines[index].getContent(this._logTime);
        }

        if (!this.lines.some(x => x instanceof SignalObject)) {
            if (this.refreshSubscriptions.length > 0) {
                this.refreshSubscriptions.forEach(s => s.unsubscribe());
                this.refreshSubscriptions = [];
            }
        }

        this.onUpdateProgressEvents.forEach(e => e(this.progress));
        this.onUpdateTextEvents.forEach(e => e(this._text));
    }
}

export default (() => {
    const promise = (async () => {
        const loggerUI = await Scene.root.findFirst('LoggerUI') as unknown as BlockSceneRoot;
        if (loggerUI == undefined) {
            return;
        }

        if (!loggerUI.hidden.pinLastValue()) {
            const logger = new Logger();
            const [
                printConsole,
                logTime,
                lock,
                maxLine,
                onClickClear,
                onClickUp,
                onClickDown,
                onClickBottom,
                onClickTop,
            ] = await Promise.all([
                loggerUI.outputs.getBoolean('printConsole'),
                loggerUI.outputs.getBoolean('logTime'),
                loggerUI.outputs.getBoolean('lock'),
                loggerUI.outputs.getScalar('maxLine'),
                loggerUI.outputs.getPulseOrFallback('onClickClear', Reactive.once()),
                loggerUI.outputs.getPulseOrFallback('onClickUp', Reactive.once()),
                loggerUI.outputs.getPulseOrFallback('onClickDown', Reactive.once()),
                loggerUI.outputs.getPulseOrFallback('onClickBottom', Reactive.once()),
                loggerUI.outputs.getPulseOrFallback('onClickTop', Reactive.once()),
            ]);

            onClickClear.subscribe(() => logger.clear());
            onClickUp.subscribe(() => logger.scrollUp());
            onClickDown.subscribe(() => logger.scrollDown());
            onClickBottom.subscribe(() => logger.scrollToBottom());
            onClickTop.subscribe(() => logger.scrollToTop());

            await Promise.all([
                invokeThenAsync(maxLine.monitor({ fireOnInitialValue: true }), n => logger.maxLine = n.newValue),
                invokeThenAsync(lock.monitor({ fireOnInitialValue: true }), n => logger.lock = n.newValue),
                invokeThenAsync(logTime.monitor({ fireOnInitialValue: true }), b => logger.logTime = b.newValue),
                invokeThenAsync(printConsole.monitor({ fireOnInitialValue: true }), b => logger.printConsole = b.newValue),
                moveByPanGesture(loggerUI),
            ])

            logger.onUpdateText(text => loggerUI.inputs.setString('Content', text));
            logger.onUpdateProgress(value => loggerUI.inputs.setScalar('Progress', value));

            return logger;
        } else {
            return Diagnostics;
        }
    })();

    return {
        log(content) {
            promise.then(logger => logger.log(content));
        },

        watch(name: string, signal: BoolSignal | ScalarSignal | StringSignal | boolean | number | string) {
            promise.then(logger => logger.watch(name, signal));
        }
    };
})();