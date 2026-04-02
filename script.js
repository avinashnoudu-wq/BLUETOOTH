// ---------------- FIREBASE INITIALIZATION ----------------
let db = null;

try {
  const firebaseConfig = {
    apiKey: "AIzaSyDvUWZxXpzGccj0WZA2MVkypcDKZWPLmhI",
    authDomain: "bluetooth-cloud.firebaseapp.com",
    databaseURL: "https://bluetooth-cloud-default-rtdb.firebaseio.com",
    projectId: "bluetooth-cloud",
    storageBucket: "bluetooth-cloud.firebasestorage.app",
    messagingSenderId: "219800338540",
    appId: "1:219800338540:web:38ef8d262bccbb0dfed849",
    measurementId: "G-T56FR5T7R4"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  db = firebase.database();
  console.log("Firebase initialized");
} catch (e) {
  console.error("Firebase init failed:", e);
}

// ---------------- UI ELEMENTS ----------------
const btStatus = document.getElementById("btStatus");
const netStatus = document.getElementById("netStatus");
const cloudStatus = document.getElementById("cloudStatus");
const connectBtn = document.getElementById("connectBtn");
const testFirebaseBtn = document.getElementById("testFirebaseBtn");
const deviceData = document.getElementById("deviceData");

// ---------------- ESP32 BLE UUIDs ----------------
const ESP32_SERVICE_UUID = "12345678-1234-1234-1234-123456789abc";
const ESP32_CHARACTERISTIC_UUID = "87654321-4321-4321-4321-cba987654321";

let device = null;
let characteristic = null;
let keepAliveInterval = null;

// ---------------- WEBSITE FIFO HISTORY ----------------
let locationHistory = [];
const MAX_HISTORY = 10;

// ---------------- BLUETOOTH SUPPORT CHECK ----------------
btStatus.innerText = ("bluetooth" in navigator) ? "Available" : "Not available";

// ---------------- INTERNET STATUS CHECK ----------------
function updateInternetStatus() {
  netStatus.innerText = navigator.onLine ? "Online" : "Offline";
}
updateInternetStatus();
window.addEventListener("online", updateInternetStatus);
window.addEventListener("offline", updateInternetStatus);

// ---------------- FIREBASE TEST ----------------
function testFirebaseWrite() {
  if (!db) {
    cloudStatus.innerText = "Firebase not ready";
    console.error("db is null");
    return;
  }

  cloudStatus.innerText = "Testing...";

  db.ref("test").set({
    message: "Hello from website",
    time: new Date().toISOString()
  })
  .then(() => {
    console.log("Test write success");
    cloudStatus.innerText = "Test success";
  })
  .catch((err) => {
    console.error("Test write failed:", err);
    cloudStatus.innerText = "Test failed";
  });
}

// ---------------- CONNECT TO ESP32 ----------------
async function connectToESP32() {
  try {
    btStatus.innerText = "Connecting...";

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [ESP32_SERVICE_UUID]
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(ESP32_SERVICE_UUID);
    characteristic = await service.getCharacteristic(ESP32_CHARACTERISTIC_UUID);

    btStatus.innerText = "Connected";
    await onBluetoothConnected();
  } catch (error) {
    console.error("Bluetooth error:", error);
    btStatus.innerText = "Connection failed";
  }
}

// ---------------- AFTER BLUETOOTH CONNECTED ----------------
async function onBluetoothConnected() {
  if (navigator.onLine) {
    netStatus.innerText = "Online";
  } else {
    netStatus.innerText = "Offline";
  }

  await sendTrueToESP32();

  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(async () => {
    try {
      if (characteristic) {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode("TRUE"));
        console.log("TRUE keep-alive sent");
      }
    } catch (err) {
      console.error("Keep-alive send failed:", err);
    }
  }, 3000);

  await characteristic.startNotifications();
  characteristic.addEventListener("characteristicvaluechanged", handleDeviceData);
}

// ---------------- SEND TRUE TO ESP32 ----------------
async function sendTrueToESP32() {
  try {
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode("TRUE"));
    console.log('"TRUE" sent to ESP32');
  } catch (error) {
    console.error("Failed to send TRUE:", error);
  }
}

// ---------------- SAVE TO FIREBASE ----------------
function saveToFirebase(rawData) {
  if (!db) {
    console.error("Firebase DB not initialized");
    cloudStatus.innerText = "Firebase not ready";
    return;
  }

  const payload = {
    data: rawData,
    timestamp: new Date().toISOString()
  };

  cloudStatus.innerText = "Uploading...";

  db.ref("devices/bt_tracker/latest").set(payload)
    .then(() => {
      console.log("Latest data updated");
    })
    .catch(err => {
      console.error("Latest upload error:", err);
    });

  db.ref("devices/bt_tracker/history").push(payload)
    .then(() => {
      console.log("Data uploaded to cloud");
      cloudStatus.innerText = "Uploaded";
    })
    .catch(err => {
      console.error("Upload error:", err);
      cloudStatus.innerText = "Upload failed";
    });
}

// ---------------- HANDLE DATA FROM ESP32 ----------------
function handleDeviceData(event) {
  const decoder = new TextDecoder("utf-8");
  const rawData = decoder.decode(event.target.value).trim();

  console.log("Device Data:", rawData);

  locationHistory.push(rawData);

  if (locationHistory.length > MAX_HISTORY) {
    locationHistory.shift();
  }

  deviceData.innerText = locationHistory.join("\n");

  saveToFirebase(rawData);
}

// ---------------- USER ACTIONS ----------------
connectBtn.addEventListener("click", () => {
  connectToESP32();
});

testFirebaseBtn.addEventListener("click", () => {
  testFirebaseWrite();
});
