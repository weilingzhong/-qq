import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

let gestureRecognizerInstance: GestureRecognizer | null = null;
let initializationPromise: Promise<GestureRecognizer> | null = null;

export const getGestureRecognizer = async (): Promise<GestureRecognizer> => {
  // Return existing instance if available
  if (gestureRecognizerInstance) return gestureRecognizerInstance;
  
  // Prevent multiple simultaneous initializations
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );
      
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      
      gestureRecognizerInstance = recognizer;
      return recognizer;
    })();
  }
  
  return initializationPromise;
};