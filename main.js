// Setup mouse controls as fallback for when hand tracking isn't available
const setupMouseControls = () => {
  const threeCanvas = document.querySelector('#three-canvas canvas');
  if (!threeCanvas) return;
  
  let isDragging = false;
  let selectedViaMouseShape = null;
  let mousePosition = new THREE.Vector3();
  let raycaster = new THREE.Raycaster();
  
  // Convert mouse position to 3D coordinates
  const getMousePosition = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  };
  
  // Find shape under mouse cursor
  const findShapeUnderMouse = (event) => {
    const mousePos = getMousePosition(event, threeCanvas);
    raycaster.setFromCamera(new THREE.Vector2(mousePos.x, mousePos.y), camera);
    const intersects = raycaster.intersectObjects(shapes, true);
    
    if (intersects.length > 0) {
      // Find the parent group of the intersected object
      let parentShape = intersects[0].object;
      while (parentShape.parent && parentShape.parent !== scene) {
        parentShape = parentShape.parent;
      }
      
      // Check if the parent is one of our shapes
      if (shapes.includes(parentShape)) {
        return parentShape;
      }
    }
    return null;
  };
  
  // Convert mouse position to world coordinates
  const mouseToWorld = (event) => {
    const mousePos = getMousePosition(event, threeCanvas);
    mousePosition.set(mousePos.x, mousePos.y, 0);
    mousePosition.unproject(camera);
    
    // Calculate the ray from the camera to the mousePosition
    const direction = mousePosition.sub(camera.position).normalize();
    
    // Calculate distance to z=0 plane
    const distance = -camera.position.z / direction.z;
    
    // Get the 3D point
    return camera.position.clone().add(direction.multiplyScalar(distance));
  };
  
  // Mouse event handlers
  threeCanvas.addEventListener('mousedown', (event) => {
    const shape = findShapeUnderMouse(event);
    if (shape) {
      selectedViaMouseShape = shape;
      isDragging = true;
      updateStatus('Shape selected with mouse');
      
      // Highlight the selected shape
      shape.children.forEach(child => {
        if (child.material && child.material.wireframe) {
          child.material.color.set(0x00ffff);
        }
      });
    } else if (event.button === 0) { // Left click on empty space
      // Create a new shape at mouse position
      const worldPos = mouseToWorld(event);
      createRandomShape(worldPos);
    }
  });
  
  threeCanvas.addEventListener('mousemove', (event) => {
    if (isDragging && selectedViaMouseShape) {
      const worldPos = mouseToWorld(event);
      selectedViaMouseShape.position.copy(worldPos);
      
      // Check if shape is over recycle bin
      const inBin = isInRecycleBinZone(selectedViaMouseShape.position);
      selectedViaMouseShape.children.forEach(child => {
        if (child.material && child.material.wireframe) {
          child.material.color.set(inBin ? 0xff0000 : 0x00ffff);
        }
      });
      
      // Update recycle bin visual
      if (recycleBinElement) {
        if (inBin) {
          recycleBinElement.classList.add('active');
          updateStatus('Release to delete shape');
        } else {
          recycleBinElement.classList.remove('active');
          updateStatus('Dragging shape');
        }
      }
    }
  });
  
  threeCanvas.addEventListener('mouseup', () => {
    if (isDragging && selectedViaMouseShape) {
      // Check if shape should be deleted
      if (isInRecycleBinZone(selectedViaMouseShape.position)) {
        scene.remove(selectedViaMouseShape);
        shapes = shapes.filter(s => s !== selectedViaMouseShape);
        updateStatus('Shape deleted');
      } else {
        // Reset wireframe color
        selectedViaMouseShape.children.forEach(child => {
          if (child.material && child.material.wireframe) {
            child.material.color.set(0xffffff);
          }
        });
        updateStatus('Shape released');
      }
    }
    
    isDragging = false;
    selectedViaMouseShape = null;
    if (recycleBinElement) {
      recycleBinElement.classList.remove('active');
    }
  });
  
  // Add mouse wheel for scaling shapes
  threeCanvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    
    // Find shape under mouse
    const shape = findShapeUnderMouse(event);
    if (shape) {
      // Scale the shape based on wheel direction
      const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
      shape.scale.multiplyScalar(scaleFactor);
      updateStatus(`Scaling shape (${shape.scale.x.toFixed(2)}x)`);
    }
  });
};// DOM element references with safety checks
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
    // Check for required elements with fallback creation
    try {
      video = getElement('webcam');
    } catch (e) {
      console.warn('Creating webcam element:', e);
      video = document.createElement('video');
      video.id = 'webcam';
      video.setAttribute('playsinline', '');
      video.style.display = 'none';
      document.body.appendChild(video);
    }
    
    try {
      canvas = getElement('canvas');
    } catch (e) {
      console.warn('Creating canvas element:', e);
      canvas = document.createElement('canvas');
      canvas.id = 'canvas';
      document.body.appendChild(canvas);
    }
    
    ctx = canvas.getContext('2d');
    
    try {
      recycleBinElement = getElement('recycle-bin');
    } catch (e) {
      console.warn('Creating recycle bin element:', e);
      recycleBinElement = document.createElement('div');
      recycleBinElement.id = 'recycle-bin';
      recycleBinElement.innerHTML = '�️';
      recycleBinElement.style.cssText = 'position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 30px; z-index: 999; transition: all 0.3s;';
      document.body.appendChild(recycleBinElement);
    }
    
    // Check for THREE.js container
    try {
      getElement('three-canvas');
    } catch (e) {
      console.warn('Creating THREE.js container:', e);
      const threeContainer = document.createElement('div');
      threeContainer.id = 'three-canvas';
      threeContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1;';
      document.body.appendChild(threeContainer);
    }
    
    // Check for THREE.js availability with dynamic loading fallback
    if (typeof THREE === 'undefined') {
      updateStatus('Loading THREE.js...');
      return loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')
        .then(() => {
          console.log('THREE.js loaded dynamically');
          return continueInitialization();
        })
        .catch(error => {
          showError(`Failed to load THREE.js: ${error.message}`);
          return Promise.reject(error);
        });
    } else {
      return continueInitialization();
    }
  } catch (error) {
    console.error('Critical initialization error:', error);
    showError(`Critical error: ${error.message}`);
    return Promise.reject(error);
  }
};

// Load a script dynamically
const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
};

// Continue initialization after ensuring dependencies
const continueInitialization = () => {
  // Create status indicator
  createStatusIndicator();
  
  // Load dependencies in sequence with fallbacks
  return loadDependencies()
    .then(() => initThree())
    .then(() => {
      // Try to initialize MediaPipe, but continue even if it fails
      return initMediaPipeHands()
        .catch(error => {
          console.warn('MediaPipe initialization failed, continuing in offline mode:', error);
          enableOfflineMode();
          return Promise.resolve(); // Continue initialization
        });
    })
    .then(() => initCamera())
    .then(() => {
      isApplicationRunning = true;
      updateStatus('Ready! Use pinch gestures or mouse to interact with shapes.');
    })
    .catch(error => {
      console.error('Error in initialization sequence:', error);
      showError(`Error initializing application: ${error.message}`);
      // Try to enable offline mode as last resort
      enableOfflineMode();
    });
};

// Load required dependencies
const loadDependencies = async () => {
  updateStatus('Loading dependencies...');
  
  const dependencies = [
    { 
      name: 'MediaPipe Hands', 
      check: () => typeof Hands !== 'undefined',
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands.min.js',
      fallbackUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.min.js'
    },
    { 
      name: 'MediaPipe Camera', 
      check: () => typeof Camera !== 'undefined',
      url: 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js',
      fallbackUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'
    }
  ];
  
  for (const dep of dependencies) {
    if (!dep.check()) {
      updateStatus(`Loading ${dep.name}...`);
      try {
        await loadScript(dep.url);
        console.log(`${dep.name} loaded successfully`);
      } catch (error) {
        console.warn(`Failed to load ${dep.name} from primary URL, trying fallback:`, error);
        try {
          await loadScript(dep.fallbackUrl);
          console.log(`${dep.name} loaded from fallback URL`);
        } catch (fallbackError) {
          console.error(`Failed to load ${dep.name}:`, fallbackError);
          // Continue without throwing to attempt offline mode
        }
      }
    } else {
      console.log(`${dep.name} already loaded`);
    }
  }
  
  return Promise.resolve();
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

// MediaPipe Hands initialization with error handling and resource preloading
const initMediaPipeHands = async () => {
  try {
    updateStatus('Loading hand tracking models...');
    
    // Create offline fallback URLs for resources
    const MEDIAPIPE_URLS = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915',
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
    ];
    
    // Test CDN connectivity before initializing
    await testCdnConnectivity();
    
    const hands = new Hands({ 
      locateFile: file => {
        // Try to use a more specific version to avoid CDN caching issues
        return `${MEDIAPIPE_URLS[0]}/${file}`;
      }
    });
    
    // Reduce model complexity for better performance and less network dependency
    hands.setOptions({ 
      maxNumHands: 2, 
      modelComplexity: 0,  // Use simpler model (0 instead of 1)
      minDetectionConfidence: 0.6,  // Slightly lower threshold
      minTrackingConfidence: 0.6    // Slightly lower threshold
    });

    // Set up custom error handler for MediaPipe internal errors
    hands.onResults((results) => {
      try {
        handleHandResults(results);
      } catch (error) {
        console.error("Error in hand tracking results handler:", error);
      }
    });
    
    // Check for compatibility
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MediaDevices API not supported in this browser');
    }
    
    // Preload the model to avoid "Failed to fetch" errors during camera streaming
    updateStatus('Preloading hand tracking models (this may take a moment)...');
    
    await hands.initialize()
      .catch(error => {
        console.error("Failed to initialize with primary CDN:", error);
        // If primary CDN fails, try alternate CDN
        updateStatus('Trying alternate model source...');
        
        // Create new hands instance with alternate CDN
        const fallbackHands = new Hands({
          locateFile: file => `${MEDIAPIPE_URLS[1]}/${file}`
        });
        
        fallbackHands.setOptions({ 
          maxNumHands: 2, 
          modelComplexity: 0,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6
        });
        
        fallbackHands.onResults((results) => {
          try {
            handleHandResults(results);
          } catch (error) {
            console.error("Error in hand tracking results handler:", error);
          }
        });
        
        return fallbackHands.initialize()
          .then(() => {
            // Use fallback instance instead
            hands = fallbackHands;
          });
      });
    
    // Set global variable for camera initialization
    window.hands = hands;
    handsInitialized = true;
    updateStatus('Hand tracking initialized successfully');
    return Promise.resolve();
  } catch (error) {
    console.error('MediaPipe Hands initialization error:', error);
    // Create a special offline mode for the app
    enableOfflineMode();
    return Promise.reject(new Error(`Failed to initialize hand tracking: ${error.message}`));
  }
};

// Test CDN connectivity before initializing MediaPipe
const testCdnConnectivity = async () => {
  try {
    updateStatus('Testing network connection...');
    
    // Test connectivity to MediaPipe CDN with a small resource
    const testUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands_solution_packed_assets.data';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(testUrl, { 
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-cache'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`CDN connectivity test failed with status: ${response.status}`);
    }
    
    updateStatus('Network connection successful');
  } catch (error) {
    console.warn('CDN connectivity test failed:', error);
    updateStatus('Network issues detected - trying offline mode');
    
    // Show a warning to the user
    showNetworkWarning();
  }
};

// Show a network warning message to the user
const showNetworkWarning = () => {
  const warningEl = document.createElement('div');
  warningEl.id = 'network-warning';
  warningEl.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(255, 165, 0, 0.8); color: white; padding: 10px; border-radius: 5px; z-index: 1000; max-width: 250px;';
  warningEl.innerHTML = `
    <strong>⚠️ Network Warning</strong>
    <p>Having trouble accessing hand tracking models. Hand tracking may not work properly.</p>
    <button id="retry-network" style="background: white; color: black; border: none; padding: 5px 10px; margin-top: 5px; border-radius: 3px; cursor: pointer;">Retry</button>
  `;
  document.body.appendChild(warningEl);
  
  // Add retry button functionality
  document.getElementById('retry-network').addEventListener('click', async () => {
    warningEl.remove();
    try {
      await testCdnConnectivity();
      // Reinitialize MediaPipe if connection is restored
      await initMediaPipeHands();
    } catch (error) {
      console.error('Network retry failed:', error);
      showNetworkWarning();
    }
  });
};

// Enable a limited offline mode that works without hand tracking
const enableOfflineMode = () => {
  updateStatus('⚠️ Running in limited mode (no hand tracking)');
  
  // Create UI for manual controls as fallback
  const controlsEl = document.createElement('div');
  controlsEl.id = 'offline-controls';
  controlsEl.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: rgba(0, 0, 0, 0.7); color: white; padding: 15px; border-radius: 5px; z-index: 1000;';
  controlsEl.innerHTML = `
    <h3 style="margin-top: 0;">Manual Controls</h3>
    <p>Hand tracking unavailable - use these controls instead:</p>
    <button id="create-shape" style="background: #00FFFF; color: black; border: none; padding: 8px; margin: 5px; width: 100%; border-radius: 3px; cursor: pointer;">Create Random Shape</button>
    <button id="clear-shapes" style="background: #FF3300; color: white; border: none; padding: 8px; margin: 5px; width: 100%; border-radius: 3px; cursor: pointer;">Clear All Shapes</button>
  `;
  document.body.appendChild(controlsEl);
  
  // Add click handlers for manual controls
  document.getElementById('create-shape').addEventListener('click', () => {
    // Create a shape at a random position
    const randomX = (Math.random() - 0.5) * 6;
    const randomY = (Math.random() - 0.5) * 4;
    createRandomShape(new THREE.Vector3(randomX, randomY, 0));
  });
  
  document.getElementById('clear-shapes').addEventListener('click', () => {
    // Remove all shapes
    shapes.forEach(shape => scene.remove(shape));
    shapes = [];
    updateStatus('All shapes cleared');
  });
  
  // Add mouse controls for interaction in offline mode
  setupMouseControls();
};

const handleHandResults = (results) => {
  try {
    if (!isApplicationRunning || !ctx || !canvas) return;
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Debug visualization of hand tracking
    const debugMode = false; // Set to true to show landmark connections
    
    // Safety check for results content
    if (!results || !results.multiHandLandmarks) {
      return;
    }
    
    // Draw hand landmarks
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      // Draw debug visualization if needed
      if (debugMode) {
        drawDebugLandmarks(results.multiHandLandmarks);
      }
      
      // Just draw thumb and index finger tips
      for (const landmarks of results.multiHandLandmarks) {
        if (!landmarks || landmarks.length < 21) continue; // Skip if landmark data is incomplete
        
        // Draw key points for better visibility
        const drawCircle = (landmark, size = 10, color = 'rgba(0, 255, 255, 0.7)') => {
          if (!landmark) return;
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, size, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        };
        
        // Draw thumb tip
        if (landmarks[4]) drawCircle(landmarks[4], 10, 'rgba(255, 100, 255, 0.8)');
        
        // Draw index finger tip
        if (landmarks[8]) drawCircle(landmarks[8], 10, 'rgba(100, 255, 255, 0.8)');
        
        // Check for pinch and draw indicator
        if (landmarks[4] && landmarks[8] && isPinch(landmarks)) {
          // Connect thumb and index with a line
          ctx.beginPath();
          ctx.moveTo(landmarks[4].x * canvas.width, landmarks[4].y * canvas.height);
          ctx.lineTo(landmarks[8].x * canvas.width, landmarks[8].y * canvas.height);
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          // Draw highlight circle at pinch center
          const centerX = (landmarks[4].x + landmarks[8].x) / 2;
          const centerY = (landmarks[4].y + landmarks[8].y) / 2;
          drawCircle({x: centerX, y: centerY}, 15, 'rgba(255, 255, 0, 0.5)');
        }
      }
    }
    
    // Process two-hand gestures (for shape creation and scaling)
    if (results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
      const [l, r] = results.multiHandLandmarks;
      if (!l || !r || l.length < 21 || r.length < 21) return;
      
      const leftPinch = isPinch(l);
      const rightPinch = isPinch(r);
      
      // Check if index fingers are close enough
      const indexesClose = areIndexFingersClose(l, r);
      
      console.log(`Two hands detected - Left pinch: ${leftPinch}, Right pinch: ${rightPinch}, Indexes close: ${indexesClose}`);
      
      // Both hands pinching = creation or scaling gesture
      if (leftPinch && rightPinch) {
        // Get the index finger positions
        const left = l[8];
        const right = r[8];
        if (!left || !right) return;
        
        // Calculate center point between index fingers
        const centerX = (left.x + right.x) / 2;
        const centerY = (left.y + right.y) / 2;
        
        // Calculate distance between index fingers (for scaling)
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        
        // Visual feedback for two-hand gesture
        ctx.beginPath();
        ctx.arc(centerX * canvas.width, centerY * canvas.height, 20, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.fill();
        
        // Draw line between hands
        ctx.beginPath();
        ctx.moveTo(left.x * canvas.width, left.y * canvas.height);
        ctx.lineTo(right.x * canvas.width, right.y * canvas.height);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = 5;
        ctx.stroke();
        
        if (!isPinching) {
          // Starting a new pinch gesture
          console.log("Starting new pinch gesture");
          const now = Date.now();
          
          // Create a new shape if fingers are close enough and cooldown has passed
          if (!shapeCreatedThisPinch && indexesClose && now - lastShapeCreationTime > shapeCreationCooldown) {
            console.log("Creating new shape at", centerX, centerY);
            // Convert 2D normalized coordinates to 3D world coordinates
            const position = get3DCoords(centerX, centerY);
            
            // Create the shape and store reference
            currentShape = createRandomShape(position);
            
            // Update state
            lastShapeCreationTime = now;
            shapeCreatedThisPinch = true;
            originalDistance = distance;
            
            // Log success
            console.log("Shape created:", currentShape);
          }
        } else if (currentShape && originalDistance) {
          // Already pinching, perform scaling
          console.log("Scaling existing shape");
          
          // Calculate scale factor
          shapeScale = distance / originalDistance;
          
          // Apply scaling to the shape
          currentShape.scale.set(shapeScale, shapeScale, shapeScale);
          
          // Update status
          updateStatus(`Scaling shape (${shapeScale.toFixed(2)}x)`);
        }
        
        // Update state
        isPinching = true;
        
        // Ensure recycle bin is not active during creation/scaling
        if (recycleBinElement) {
          recycleBinElement.classList.remove('active');
        }
        
        return; // Exit early to avoid further processing
      }
    }
    
    // If we reach here, we're not in a two-hand pinch gesture
    isPinching = false;
    shapeCreatedThisPinch = false;
    originalDistance = null;
    currentShape = null;
    
    // Process single-hand gestures (for shape selection and movement)
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        if (!landmarks || landmarks.length < 21 || !landmarks[8]) continue;
        
        // Get index finger tip position
        const indexTip = landmarks[8];
        
        // Convert to 3D space
        const position = get3DCoords(indexTip.x, indexTip.y);
        
        // Check for pinch gesture (thumb and index finger)
        if (isPinch(landmarks)) {
          console.log("Single hand pinch detected");
          
          // If no shape is selected, try to find the nearest one
          if (!selectedShape) {
            selectedShape = findNearestShape(position);
            if (selectedShape) {
              console.log("Selected shape:", selectedShape);
              updateStatus('Shape selected');
            }
          }
          
          // If a shape is selected, move it
          if (selectedShape) {
            // Move shape to follow finger position
            selectedShape.position.copy(position);
            updateStatus('Moving shape');
            
            // Check if shape is over recycle bin
            const inBin = isInRecycleBinZone(selectedShape.position);
            
            // Change wireframe color based on bin position
            selectedShape.children.forEach(child => {
              if (child.material && child.material.wireframe) {
                child.material.color.set(inBin ? 0xff0000 : 0xffffff);
              }
            });
            
            // Highlight recycle bin if shape is over it
            if (recycleBinElement) {
              if (inBin) {
                recycleBinElement.classList.add('active');
                updateStatus('Release to delete shape');
              } else {
                recycleBinElement.classList.remove('active');
              }
            }
          }
        } else {
          // Pinch released - handle shape release or deletion
          if (selectedShape) {
            // Check if shape should be deleted
            if (isInRecycleBinZone(selectedShape.position)) {
              scene.remove(selectedShape);
              shapes = shapes.filter(s => s !== selectedShape);
              updateStatus('Shape deleted');
            } else {
              updateStatus('Shape released');
            }
            
            // Clear selection
            selectedShape = null;
          }
          
          // Ensure recycle bin is not highlighted
          if (recycleBinElement) {
            recycleBinElement.classList.remove('active');
          }
        }
      }
    } else {
      // No hands detected - clean up any state
      if (selectedShape && isInRecycleBinZone(selectedShape.position)) {
        scene.remove(selectedShape);
        shapes = shapes.filter(s => s !== selectedShape);
        updateStatus('Shape deleted');
      }
      
      selectedShape = null;
      
      if (recycleBinElement) {
        recycleBinElement.classList.remove('active');
      }
    }
  } catch (error) {
    console.error('Error in hand tracking results handler:', error);
    // Don't stop the application for gesture recognition errors
  }
};

// Helper to draw debug landmarks (useful for development)
const drawDebugLandmarks = (multiHandLandmarks) => {
  for (const landmarks of multiHandLandmarks) {
    if (!landmarks) continue;
    
    // Draw all landmarks
    for (let i = 0; i < landmarks.length; i++) {
      const landmark = landmarks[i];
      if (!landmark) continue;
      
      ctx.beginPath();
      ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      ctx.fill();
      
      // Add index number for reference
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.fillText(i.toString(), landmark.x * canvas.width + 5, landmark.y * canvas.height - 5);
    }
    
    // Draw connections between landmarks for better visualization
    const connections = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index finger
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle finger
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring finger
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm
      [0, 5], [5, 9], [9, 13], [13, 17]
    ];
    
    for (const [i, j] of connections) {
      if (!landmarks[i] || !landmarks[j]) continue;
      
      ctx.beginPath();
      ctx.moveTo(landmarks[i].x * canvas.width, landmarks[i].y * canvas.height);
      ctx.lineTo(landmarks[j].x * canvas.width, landmarks[j].y * canvas.height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
    
    // Enable mouse controls as a fallback
    enableOfflineMode();
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
        
        // Create Camera instance for MediaPipe with error handling
        try {
          const cameraInstance = new Camera(video, {
            onFrame: async () => {
              try {
                if (window.hands && isApplicationRunning) {
                  await window.hands.send({ image: video })
                    .catch(error => {
                      // Handle MediaPipe send errors without crashing
                      console.warn('Error sending frame to MediaPipe:', error);
                      
                      // Count consecutive errors
                      if (!window.frameErrorCount) window.frameErrorCount = 0;
                      window.frameErrorCount++;
                      
                      // If we have too many consecutive errors, switch to offline mode
                      if (window.frameErrorCount > 30) {
                        console.error('Too many frame processing errors, switching to offline mode');
                        enableOfflineMode();
                        throw new Error('Hand tracking failed - switched to offline mode');
                      }
                    });
                  
                  // Reset error count on success
                  window.frameErrorCount = 0;
                }
              } catch (error) {
                console.error('Error processing frame:', error);
                // Don't reject the promise, just log the error and continue
              }
            },
            width: video.videoWidth,
            height: video.videoHeight
          });
          
          cameraInstance.start()
            .then(resolve)
            .catch(err => {
              console.error('Camera start error:', err);
              // Try a fallback approach without MediaPipe Camera
              setupFallbackRendering(video);
              resolve(); // Resolve anyway to continue app initialization
            });
        } catch (cameraError) {
          console.error('Error creating Camera instance:', cameraError);
          setupFallbackRendering(video);
          resolve(); // Resolve anyway to continue app initialization
        }
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

// Setup fallback rendering without MediaPipe Camera
const setupFallbackRendering = (videoElement) => {
  updateStatus('Using fallback video rendering');
  
  // Make video visible as fallback
  videoElement.style.display = 'block';
  videoElement.style.position = 'absolute';
  videoElement.style.zIndex = '-1';
  videoElement.style.opacity = '0.7';
  videoElement.play().catch(e => console.error('Video play error:', e));
  
  // Enable mouse controls since hand tracking might be unreliable
  setupMouseControls();
};

// Start the application when the document is fully loaded
document.addEventListener('DOMContentLoaded', initApp);