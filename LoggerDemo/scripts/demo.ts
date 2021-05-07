import Logger from './Logger';
import Time from 'Time';

(async function () {
    const logger = await Logger;
    Time.ms.mod(500).gt(250).onOn().subscribe(() => logger.log(`Runtime: ${Time.ms.pinLastValue()}`))
})();
