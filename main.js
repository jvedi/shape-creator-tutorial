// DOM element references with safety checks
const getElement = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    console.error(`Element with id "${id}" not found`);
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
};

// Safely get DOM elements
let video, canvas, ctx, recycleBinElement;
let scene, camera, renderer;
let shapes = [];
let currentShape = null;
let isPinching = false;
let shapeScale = 1;
let originalDistance = null;
let selectedShape = null;
let shapeCreatedThisPinch = false;
let lastShapeCreationTime = 0;
const shapeCreationCooldown = 1000;
let isApplicationRunning = false;
let handsInitialized = false;

// App initialization with error handling
const initApp = () => {
  try {
    // Check for required elements
    video = getElement('webcam');
    canvas = getElement('canvas');
    ctx = canvas.getContext('2d');
    recycleBinElement = getElement('recycle-bin');
    
    // Check for THREE.js availability
    if (typeof THREE === 'undefined') {
      showError('THREE.js not loaded. Please check your internet connection and reload the page.');
      return;
    }
    
    // Create status indicator
    createStatusIndicator();
    
    // Initialize application components with proper error handling
    initThree()
      .then(() => initMediaPipeHands())
      .then(() => initCamera())
      .then(() => {
        isApplicationRunning = true;
        updateStatus('Ready! Use pinch gestures to create and manipulate shapes.');
      })
      .catch(error => {
        console.error('Error initializing application:', error);
        showError(`Error initializing application: ${error.message}`);
      });
    
    // Set up window resize handler
    window.addEventListener('resize', handleWindowResize);
    
    // Set up cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
  } catch (error) {
    console.error('Critical initialization error:', error);
    showError(`Critical error: ${error.message}`);
  }
};

// Create status indicator for user feedback
const createStatusIndicator = () => {
  const statusElement = document.createElement('div');
  statusElement.id = 'status-indicator';
  statusElement.style.cssText = 'position: fixed; bottom: 20px; left: 20px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; z-index: 1000;';
  document.body.appendChild(statusElement);
  
  const errorElement = document.createElement('div');
  errorElement.id = 'error-message';
  errorElement.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,0,0,0.8); color: white; padding: 20px; border-radius: 5px; z-index: 1001; display: none; max-width: 80%; text-align: center;';
  document.body.appendChild(errorElement);
  
  updateStatus('Initializing...');
};

const updateStatus = (message) => {
  const statusElement = document.getElementById('status-indicator');
  if (statusElement) {
    statusElement.textContent = message;
  }
};

const showError = (message) => {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Add retry button
    if (!document.getElementById('retry-button')) {
      const retryButton = document.createElement('button');
      retryButton.id = 'retry-button';
      retryButton.textContent = 'Retry';
      retryButton.style.cssText = 'margin-top: 15px; padding: 8px 16px; background: white; color: black; border: none; border-radius: 4px; cursor: pointer;';
      retryButton.onclick = () => {
        window.location.reload();
      };
      errorElement.appendChild(document.createElement('br'));
      errorElement.appendChild(retryButton);
    }
  }
  
  updateStatus('Error encountered');
};

// THREE.js initialization with error handling
const initThree = async () => {
  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (e) {
      // Fallback to basic renderer if WebGL not supported
      console.warn('WebGL renderer failed, falling back to basic renderer:', e);
      renderer = new THREE.CanvasRenderer({ alpha: true });
    }
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    getElement('three-canvas').appendChild(renderer.domElement);
    
    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);
    
    // Add directional light for better visibility
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 1, 5);
    scene.add(directionalLight);
    
    animate();
    updateStatus('3D environment initialized');
    return Promise.resolve();
  } catch (error) {
    console.error('THREE.js initialization error:', error);
    return Promise.reject(new Error('Failed to initialize 3D environment'));
  }
};

const animate = () => {
  if (!isApplicationRunning) return;
  
  requestAnimationFrame(animate);
  try {
    shapes.forEach(shape => {
      if (shape !== selectedShape) {
        shape.rotation.x += 0.01;
        shape.rotation.y += 0.01;
      }
    });
    renderer.render(scene, camera);
  } catch (error) {
    console.error('Animation error:', error);
    // Don't stop animation loop for minor errors
  }
};

const handleWindowResize = () => {
  try {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  } catch (error) {
    console.error('Window resize handling error:', error);
  }
};

const cleanup = () => {
  try {
    isApplicationRunning = false;
    
    // Release camera
    if (video && video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    
    // Clean up THREE.js resources
    if (renderer) {
      renderer.dispose();
    }
    
    // Remove event listeners
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('beforeunload', cleanup);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

const neonColors = [0xFF00FF, 0x00FFFF, 0xFF3300, 0x39FF14, 0xFF0099, 0x00FF00, 0xFF6600, 0xFFFF00];
let colorIndex = 0;

const getNextNeonColor = () => {
  const color = neonColors[colorIndex];
  colorIndex = (colorIndex + 1) % neonColors.length;
  return color;
};

const createRandomShape = (position) => {
  try {
    const geometries = [
      new THREE.BoxGeometry(),
      new THREE.SphereGeometry(0.5, 32, 32),
      new THREE.ConeGeometry(0.5, 1, 32),
      new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
    ];
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    const color = getNextNeonColor();
    const group = new THREE.Group();

    const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5 });
    const fillMesh = new THREE.Mesh(geometry, material);

    const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);

    group.add(fillMesh);
    group.add(wireframeMesh);
    group.position.copy(position);
    scene.add(group);

    // Add visual feedback for shape creation
    createFeedbackEffect(position);

    shapes.push(group);
    updateStatus(`Shape created (${shapes.length} total)`);
    return group;
  } catch (error) {
    console.error('Error creating shape:', error);
    updateStatus('Failed to create shape');
    return null;
  }
};

const createFeedbackEffect = (position) => {
  try {
    // Create a pulsing sphere effect
    const feedbackGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const feedbackMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xFFFFFF, 
      transparent: true, 
      opacity: 0.8 
    });
    const feedbackMesh = new THREE.Mesh(feedbackGeometry, feedbackMaterial);
    feedbackMesh.position.copy(position);
    scene.add(feedbackMesh);
    
    // Animate and remove the feedback effect
    let scale = 1;
    const expandAndFade = () => {
      scale += 0.1;
      feedbackMesh.scale.set(scale, scale, scale);
      feedbackMaterial.opacity -= 0.05;
      
      if (feedbackMaterial.opacity > 0) {
        requestAnimationFrame(expandAndFade);
      } else {
        scene.remove(feedbackMesh);
      }
    };
    
    expandAndFade();
  } catch (error) {
    console.error('Error creating feedback effect:', error);
    // Non-critical, so just log the error
  }
};

const get3DCoords = (normX, normY) => {
  try {
    const x = (normX - 0.5) * 10;
    const y = (0.5 - normY) * 10;
    return new THREE.Vector3(x, y, 0);
  } catch (error) {
    console.error('Error calculating 3D coordinates:', error);
    // Fallback to origin if there's an error
    return new THREE.Vector3(0, 0, 0);
  }
};

const isPinch = (landmarks) => {
  try {
    if (!landmarks || !landmarks[4] || !landmarks[8]) {
      return false;
    }
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    return d(landmarks[4], landmarks[8]) < 0.06;
  } catch (error) {
    console.error('Error detecting pinch:', error);
    return false;
  }
};

const areIndexFingersClose = (l, r) => {
  try {
    if (!l || !r || !l[8] || !r[8]) {
      return false;
    }
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return d(l[8], r[8]) < 0.12;
  } catch (error) {
    console.error('Error checking index fingers proximity:', error);
    return false;
  }
};

const findNearestShape = (position) => {
  try {
    let minDist = Infinity;
    let closest = null;
    shapes.forEach(shape => {
      const dist = shape.position.distanceTo(position);
      if (dist < 1.5 && dist < minDist) {
        minDist = dist;
        closest = shape;
      }
    });
    return closest;
  } catch (error) {
    console.error('Error finding nearest shape:', error);
    return null;
  }
};

const isInRecycleBinZone = (position) => {
  try {
    const vector = position.clone().project(camera);
    const screenX = ((vector.x + 1) / 2) * window.innerWidth;
    const screenY = ((-vector.y + 1) / 2) * window.innerHeight;

    const binWidth = 160;
    const binHeight = 160;
    const binLeft = window.innerWidth - 60 - binWidth;
    const binTop = window.innerHeight - 60 - binHeight;
    const binRight = binLeft + binWidth;
    const binBottom = binTop + binHeight;

    const adjustedX = window.innerWidth - screenX;

    return adjustedX >= binLeft && adjustedX <= binRight && screenY >= binTop && screenY <= binBottom;
  } catch (error) {
    console.error('Error checking recycle bin zone:', error);
    return false;
  }
};

// MediaPipe Hands initialization with error handling
const initMediaPipeHands = async () => {
  try {
    updateStatus('Initializing hand tracking...');
    
    const hands = new Hands({ 
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` 
    });
    
    hands.setOptions({ 
      maxNumHands: 2, 
      modelComplexity: 1, 
      minDetectionConfidence: 0.7, 
      minTrackingConfidence: 0.7 
    });

    hands.onResults(handleHandResults);
    
    // Check for compatibility
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MediaDevices API not supported in this browser');
    }
    
    // Set global variable for camera initialization
    window.hands = hands;
    handsInitialized = true;
    updateStatus('Hand tracking initialized');
    return Promise.resolve();
  } catch (error) {
    console.error('MediaPipe Hands initialization error:', error);
    return Promise.reject(new Error('Failed to initialize hand tracking'));
  }
};

const handleHandResults = (results) => {
  try {
    if (!isApplicationRunning || !ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw landmarks
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        if (!landmarks) continue;
        
        // Draw circles at key points
        const drawCircle = (landmark, size = 10, color = 'rgba(0, 255, 255, 0.7)') => {
          if (!landmark) return;
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, size, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        };
        
        if (landmarks[4]) drawCircle(landmarks[4]); // Thumb tip
        if (landmarks[8]) drawCircle(landmarks[8]); // Index tip
        
        // Add extra visual feedback for pinch gesture
        if (landmarks[4] && landmarks[8] && isPinch(landmarks)) {
          // Draw connecting line for pinch
          ctx.beginPath();
          ctx.moveTo(landmarks[4].x * canvas.width, landmarks[4].y * canvas.height);
          ctx.lineTo(landmarks[8].x * canvas.width, landmarks[8].y * canvas.height);
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          // Draw highlight circle
          const centerX = (landmarks[4].x + landmarks[8].x) / 2;
          const centerY = (landmarks[4].y + landmarks[8].y) / 2;
          drawCircle({x: centerX, y: centerY}, 15, 'rgba(255, 255, 0, 0.5)');
        }
      }
    }
    
    // Handle two-hand gestures
    if (results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
      const [l, r] = results.multiHandLandmarks;
      if (!l || !r) return;
      
      const leftPinch = isPinch(l);
      const rightPinch = isPinch(r);
      const indexesClose = areIndexFingersClose(l, r);

      if (leftPinch && rightPinch) {
        const left = l[8];
        const right = r[8];
        if (!left || !right) return;
        
        const centerX = (left.x + right.x) / 2;
        const centerY = (left.y + right.y) / 2;
        const distance = Math.hypot(left.x - right.x, left.y - right.y);

        if (!isPinching) {
          const now = Date.now();
          if (!shapeCreatedThisPinch && indexesClose && now - lastShapeCreationTime > shapeCreationCooldown) {
            currentShape = createRandomShape(get3DCoords(centerX, centerY));
            lastShapeCreationTime = now;
            shapeCreatedThisPinch = true;
            originalDistance = distance;
          }
        } else if (currentShape && originalDistance) {
          shapeScale = distance / originalDistance;
          currentShape.scale.set(shapeScale, shapeScale, shapeScale);
          updateStatus(`Scaling shape (${shapeScale.toFixed(2)}x)`);
        }
        isPinching = true;
        recycleBinElement.classList.remove('active');
        return;
      }
    }

    isPinching = false;
    shapeCreatedThisPinch = false;
    originalDistance = null;
    currentShape = null;

    // Handle single-hand gestures
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        if (!landmarks || !landmarks[8]) continue;
        
        const indexTip = landmarks[8];
        const position = get3DCoords(indexTip.x, indexTip.y);

        if (isPinch(landmarks)) {
          if (!selectedShape) {
            selectedShape = findNearestShape(position);
            if (selectedShape) {
              updateStatus('Shape selected');
            }
          }
          
          if (selectedShape) {
            selectedShape.position.copy(position);
            updateStatus('Moving shape');

            const inBin = isInRecycleBinZone(selectedShape.position);
            selectedShape.children.forEach(child => {
              if (child.material && child.material.wireframe) {
                child.material.color.set(inBin ? 0xff0000 : 0xffffff);
              }
            });
            
            if (inBin) {
              recycleBinElement.classList.add('active');
              updateStatus('Release to delete shape');
            } else {
              recycleBinElement.classList.remove('active');
            }
          }
        } else {
          if (selectedShape) {
            if (isInRecycleBinZone(selectedShape.position)) {
              scene.remove(selectedShape);
              shapes = shapes.filter(s => s !== selectedShape);
              updateStatus('Shape deleted');
            } else {
              updateStatus('Shape released');
            }
            selectedShape = null;
          }
          recycleBinElement.classList.remove('active');
        }
      }
    } else {
      if (selectedShape && isInRecycleBinZone(selectedShape.position)) {
        scene.remove(selectedShape);
        shapes = shapes.filter(s => s !== selectedShape);
        updateStatus('Shape deleted');
      }
      selectedShape = null;
      recycleBinElement.classList.remove('active');
    }
  } catch (error) {
    console.error('Error in hand tracking results handler:', error);
    // Don't stop the application for gesture recognition errors
  }
};

// Camera initialization with robust error handling
const initCamera = async () => {
  try {
    updateStatus('Initializing camera...');
    
    // Verify MediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not supported in this browser');
    }
    
    // Check if MediaPipe Hands is initialized
    if (!handsInitialized || !window.hands) {
      throw new Error('Hand tracking must be initialized before camera');
    }
    
    // Try with preferred settings first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } 
      });
      
      await setupCameraStream(stream);
      updateStatus('Camera initialized (HD)');
    } catch (preferredError) {
      console.warn('Could not access camera with preferred settings:', preferredError);
      updateStatus('Trying alternative camera settings...');
      
      // Try with minimal requirements
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
        
        await setupCameraStream(fallbackStream);
        updateStatus('Camera initialized (basic)');
      } catch (fallbackError) {
        // Check specific error types
        if (fallbackError.name === 'NotFoundError') {
          throw new Error('No camera found. Please connect a camera and reload the page.');
        } else if (fallbackError.name === 'NotAllowedError') {
          throw new Error('Camera access denied. Please allow camera access and reload the page.');
        } else if (fallbackError.name === 'AbortError') {
          throw new Error('Camera already in use by another application.');
        } else {
          throw new Error(`Camera initialization failed: ${fallbackError.message}`);
        }
      }
    }
    
    return Promise.resolve();
  } catch (error) {
    console.error('Camera initialization error:', error);
    return Promise.reject(error);
  }
};

const setupCameraStream = async (stream) => {
  return new Promise((resolve, reject) => {
    try {
      // Set a timeout for loading metadata
      const metadataTimeout = setTimeout(() => {
        reject(new Error('Camera metadata loading timeout'));
      }, 5000);
      
      video.srcObject = stream;
      
      // Handle successful metadata loading
      video.onloadedmetadata = () => {
        clearTimeout(metadataTimeout);
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Create Camera instance for MediaPipe
        const cameraInstance = new Camera(video, {
          onFrame: async () => {
            try {
              if (window.hands) {
                await window.hands.send({ image: video });
              }
            } catch (error) {
              console.error('Error processing frame:', error);
              // Continue processing next frames
            }
          },
          width: video.videoWidth,
          height: video.videoHeight
        });
        
        cameraInstance.start()
          .then(resolve)
          .catch(reject);
      };
      
      // Handle loading errors
      video.onerror = (event) => {
        clearTimeout(metadataTimeout);
        reject(new Error(`Video loading error: ${event.target.error}`));
      };
    } catch (error) {
      reject(error);
    }
  });
};

// Start the application when the document is fully loaded
document.addEventListener('DOMContentLoaded', initApp);