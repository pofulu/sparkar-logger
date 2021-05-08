import Logger from './Logger';
import Scene from 'Scene';
import TouchGestures from 'TouchGestures';
import DeviceMotion from 'DeviceMotion';
import CameraInfo from 'CameraInfo';
import Textures from 'Textures';
import Locale from 'Locale';
import Time from 'Time';

(async function () {
    // Log inner error from Spark AR if the 'onPinch' capability dosen't be enabled.
    try {
        TouchGestures.onPinch();
    } catch (error) {
        // Throw a undefined error when the pinch gesture is not enabled.
        Logger.log(error.toString());
    }

    // "hello world!"
    Logger.log("hello world!");

    // Watch runtime
    Logger.watch('runtime', Time.ms);

    // Log device motion
    try {
        Logger.watch('dmX', DeviceMotion.worldTransform.rotationX);
        Logger.watch('dmY', DeviceMotion.worldTransform.rotationY);
        Logger.watch('dmZ', DeviceMotion.worldTransform.rotationZ);
    } catch (error) {
        Logger.log('Please check the capability of DeviceMotion');
    }

    // Log planeTracker's confidence
    const planeTracker0 = await Scene.root.findFirst('planeTracker0') as PlaneTracker;
    planeTracker0.confidence.monitor({ fireOnInitialValue: true }).subscribe(c => Logger.log(c));

    // Log current camera mode: BACK/FRONT
    CameraInfo.captureDevicePosition.monitor({ fireOnInitialValue: true }).subscribe(v => Logger.log(`Set camera to ${v.newValue}`));

    // Log when start recording
    CameraInfo.isRecordingVideo.onOn().subscribe(() => Logger.log("Start recording"));

    // Log galleryTexture0's type
    const galleryTexture0 = await Textures.findFirst('galleryTexture0') as GalleryTexture;
    galleryTexture0.onMediaChange.subscribe(m => Logger.log(`galleryTexture: ${m.mediaType}`));

    // Watch locale info
    Logger.watch('language', Locale.language);
    Logger.watch('locale', Locale.locale);
    Logger.watch('region', Locale.region);
})();