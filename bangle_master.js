// load settings:
const verString = "HAR v1.0";      
const PAGE_SIZE = 1200*6;     
const HEADER_SIZE = 32;       
const PAGES_FLASH = 28;       
const FLASHF_SIZE = HEADER_SIZE+PAGES_FLASH*PAGE_SIZE; 
const MAX_FILES = 19;         
const STATUS_SIZE = 14;       

const HRM_LOGGING = true;
const storage = require("Storage");

// global variables:
var b = new Uint8Array(PAGE_SIZE);
var header = new Uint8Array(HEADER_SIZE);  
var currMSBs = new Uint8Array(3);  
var prevMSBs = new Uint8Array(3);  
var myStatus = new Uint8Array(STATUS_SIZE); 
var deltaOn = false;
var deltaIdx = -1;
var accelIdx = 0;              
var statusIdx = 0;
var pagesIdx = HEADER_SIZE;   
var numPages = 0;
var numFiles = 0;
var filename = "";
var steps = 0;
var recordingDisplayInterval = 0;

// Recording states
const STATE_IDLE              = 0;
const STATE_READY             = 1;
const STATE_WAITING           = 2;
const STATE_RECORDING         = 3;
const STATE_FINISHED          = 4;
const STATE_SHUTDOWN_CONFIRM  = 5;

var recordState = STATE_IDLE;

// !!! ALWAYS "RIGHT LEG" FOR THE PRIMARY TRIGGER WATCH !!!
const DEVICE_NAME = "MASTER RH"; 

var scheduledStartTime = 0;

// Statistics
var recordStartTime = 0;
var recordStopTime = 0;
var sampleCount = 0;
var droppedSamples = 0;
var expectedSampleInterval = 20; 
var previousSampleTime = 0;

var isBusy = false;
var meanMag = 0;
var meanDiff= 0;
var bleInt = 0;  
var isConnected = true;
var isHRM = false;
var accReadsMin = 0; 
var HZ=12.5,GS=8;  
var fList = [];
var stepTimeDiff = 9999; 
var stepsInt = 0; 
var startLogHour = 25;
var actMins = new Uint16Array(4);
var consecSteps = 0;
var stepsBuf = new Float32Array(3);

// UI Screens
function drawReadyScreen() {
  g.clear();
  
  // Draw Battery in top right corner
  var batt = E.getBattery();
  var isCharging = Bangle.isCharging();
  g.setFont("Vector",14).setColor(1,1,1).setFontAlign(1,-1);
  g.drawString((isCharging ? "⚡ " : "") + batt + "%", 230, 10);
  
  g.setFontAlign(0,0);
  g.setFont("Vector",26);
  g.setColor(1,1,1).drawString(DEVICE_NAME,120,35);
  g.setFont("Vector",34);
  g.setColor(0.9,0.5,0); // Orange / Master Leader visual theme
  g.drawString("READY",120,95);
  
  g.setColor(1,1,1);
  g.setFont("Vector",16);
  g.drawString("BTN2 blasts ALL 4 links",120,145);
  g.setFont("Vector",14);
  g.drawString("BTN1 = Power Off Device",120,185);
  g.drawString("BTN2 = Send START Pulse",120,210);
}

function drawShutdownConfirmScreen() {
  g.clear();
  g.setFontAlign(0,0);
  g.setFont("Vector",24).setColor(1,1,1);
  g.drawString("Power Off Device?", 120, 50);
  
  g.setFont("Vector",20);
  g.setColor(1,0,0).drawString("BTN1 = YES (Turn Off)", 120, 110);
  g.setColor(0,1,0).drawString("BTN3 = NO (Cancel)", 120, 160);
}

function drawCountdown(seconds){
  g.clear();
  g.setFontAlign(0,0);
  g.setFont("Vector",24);
  g.setColor(1,1,1).drawString(DEVICE_NAME,120,35);
  g.setFont("Vector",60);
  g.setColor(1,1,0); 
  g.drawString(seconds,120,120);
  g.setColor(1,1,1);
  g.setFont("Vector",22);
  g.drawString("Starting...",120,190);
}

function drawRecordingScreen(timeStr){
  g.clear(); 
  
  // Draw Battery in top right corner
  var batt = E.getBattery();
  var isCharging = Bangle.isCharging();
  g.setFont("Vector",14).setColor(1,1,1).setFontAlign(1,-1);
  g.drawString((isCharging ? "⚡ " : "") + batt + "%", 230, 10);
  
  g.setFontAlign(0,0);
  g.setFont("Vector",24);
  g.setColor(1,1,1).drawString(DEVICE_NAME,120,25);
  g.setColor(1,0,0); 
  g.setFont("Vector",30);
  g.drawString("● RECORDING",120,80);
  g.setColor(1,1,1);
  g.setFont("Vector",20);
  g.drawString(timeStr || "00:00",120,135);
  g.setFont("Vector",18);
  g.drawString(HZ + " Hz",120,170); 
  g.setFont("Vector",14);
  g.drawString("BTN3 = Stop ALL Nodes",120,225); 
}

function drawSummaryScreen(rate,duration,size){
  g.clear();
  g.setFontAlign(0,0);
  g.setFont("Vector",22);
  g.setColor(1,1,1).drawString("Recording Complete",120,25);
  g.setFont("Vector",16);
  g.drawString("Duration : "+duration.toFixed(2)+" s",120,65);
  g.drawString("Samples : "+sampleCount,120,95);
  g.drawString("Rate : "+rate.toFixed(2)+" Hz",120,125);
  g.drawString("Dropped : "+droppedSamples,120,155);
  g.drawString("Size : "+size+" bytes",120,185);
  g.setColor(0,1,0);
  g.drawString("BTN1 = Done / Reset",120,220);
}

function outp(str) { 
  g.setFont("Vector",17).setColor(0x00FF).clearRect(0,215,240,240).drawString(str,70,220);
}

function longToByteArray(long) { "ram";
  var byteArray = [0, 0, 0, 0, 0, 0, 0, 0];
  for ( var index = 0; index < byteArray.length; index ++ ) {
    var byte = long & 0xff;
    byteArray [ index ] = byte;
    long = (long - byte) / 256 ;
  }
  return byteArray;
}

function prepHeader() { "ram";
  let millis = Date.now(); 
  let hArr = longToByteArray(millis);
  for (var i=0; i<8; i++) header[i] = hArr[i];  
  header[10] = parseInt("0x"+NRF.getAddress()[12]);
  header[11] = parseInt("0x"+NRF.getAddress()[13]);
  header[12] = parseInt("0x"+NRF.getAddress()[15]);
  header[13] = parseInt("0x"+NRF.getAddress()[16]);
}

// Keep track of the elapsed samples to calculate relative time mathematically
var relativeSampleCount = 0;

function accelHandlerRecord(a) { "ram";
  if (HZ==12.5) {   
     stepsBuf[0] = stepsBuf[1]; stepsBuf[1] = stepsBuf[2]; stepsBuf[2] = a.mag;
     stepsInt+=80;
     if ( (stepsBuf[0]<stepsBuf[1]) && (stepsBuf[2]<stepsBuf[1]) && (stepsBuf[1]>0.6) ) {  
       stepTimeDiff = stepsInt; stepsInt = 0; 
       if ( (stepTimeDiff >= 1100) || (stepTimeDiff <= 240) ) { consecSteps = 0; } 
       else {
         consecSteps++;
         if (consecSteps>5) {
           if (consecSteps==6) { steps += 6; if (myStatus[5]<250) myStatus[5]+=6; } 
           else { if (myStatus[5]<255) myStatus[5]++; steps++; }
         }
       }
     }
     meanMag += (a.mag/accReadsMin); meanDiff += (a.diff/accReadsMin); 
  }
  
  if (recordState == STATE_RECORDING) {
    sampleCount++;
    relativeSampleCount++; // Track total samples written to this file
    
    let now = Date.now();
    if (previousSampleTime !== 0) {
      let diff = now - previousSampleTime;
      if (diff > expectedSampleInterval * 1.5) droppedSamples++;
    }
    previousSampleTime = now;

    myStatus[6] = (a.x*8192)>>8; myStatus[7] = (a.y*8192)>>8; myStatus[8] = (a.z*8192)>>8;
    currMSBs[0] = (a.x*8192)>>8; currMSBs[1] = (a.y*8192)>>8; currMSBs[2] = (a.z*8192)>>8;

    // Write the standard accelerometer data to the binary buffer
    if ((accelIdx>5)&&(currMSBs[0]==prevMSBs[0])&&(currMSBs[1]==prevMSBs[1])&&(currMSBs[2]==prevMSBs[2])){
      if (!deltaOn) {
        b[accelIdx]=0xFF; b[accelIdx+1]=0xFF; b[accelIdx+2]=0; deltaIdx = accelIdx+2; 
        b[accelIdx+3]=(a.x*8192); b[accelIdx+4]=(a.y*8192); b[accelIdx+5]=(a.z*8192);
        accelIdx+=6; deltaOn=true;
      } else {
        b[accelIdx]=(a.x*8192); b[accelIdx+1]=(a.y*8192); b[accelIdx+2]=(a.z*8192);
        b[deltaIdx]++; if (b[deltaIdx]==254) { deltaOn=false; deltaIdx = -1; prevMSBs.set([0xFF,0xFF,0xFF]); }
        accelIdx+=3; 
      }
    } else {   
      b[accelIdx+0] = (a.x*8192); b[accelIdx+1] = currMSBs[0];
      if ((b[accelIdx+0]==255)&&(b[accelIdx+1]==255)) {b[accelIdx+0]=0xFE;}
      b[accelIdx+2] = (a.y*8192); b[accelIdx+3] = currMSBs[1];
      b[accelIdx+4] = (a.z*8192); b[accelIdx+5] = currMSBs[2];
      accelIdx+=6; deltaOn=false; prevMSBs.set(currMSBs);  
    }
    
    if (accelIdx+3>=PAGE_SIZE) {
      while (accelIdx<PAGE_SIZE) { b[accelIdx]=0xFF; accelIdx++; }
      saveToFlash();
    }
  }
}

function saveToFlash() { "ram";
  isBusy = true;
  if (numPages==0) {  
      let d = new Date();
      filename = "d" + d.getFullYear() + ("0"+(d.getMonth()+1)).substr(-2) + ("0"+d.getDate()).substr(-2) + ("0"+d.getHours()).substr(-2) + ("0"+d.getMinutes()).substr(-2) + ".bin";
      try { storage.write(filename, header, 0, FLASHF_SIZE); }
      catch(err) { numPages = PAGES_FLASH; return; }
      pagesIdx = HEADER_SIZE;
  }
  try { storage.write(filename, b, pagesIdx, FLASHF_SIZE); } 
  catch(err) { numPages = PAGES_FLASH; return; }
  
  numPages++; pagesIdx += accelIdx; accelIdx = 0; deltaIdx = -1; deltaOn=false;
  currMSBs.set([0xFF,0xFF,0xFF]);
  if (HEADER_SIZE+(numPages+1)*PAGE_SIZE>FLASHF_SIZE) {
    numPages=0; numFiles++;
    if (numFiles>=MAX_FILES) { recStop(); } 
    else { prepHeader(); }
  }
  isBusy = false;
}

function accelConfig(hz, gs) { "ram";
  Bangle.setPollInterval(1000 / hz);
}

function accSetup(hz, gs) { "ram";
  HZ = hz ? hz : HZ;
  GS = gs ? gs : GS;
  header[8] = GS; 
  header[9] = HZ; 
  Bangle.removeAllListeners('accel');
  accelConfig(HZ, GS);
  accReadsMin = HZ * 60;
  setTimeout(function(){ Bangle.on('accel', accelHandlerRecord); }, 1000);
}

function HRMSetup() { "ram";
  if (HRM_LOGGING) {
    isHRM = true; Bangle.setHRMPower(true); 
    Bangle.on('HRM', function(hrm) {
      if (!isBusy) {
        if ((hrm.confidence>myStatus[12])&&(hrm.bpm<200)) {   
          myStatus[11] = (myStatus[11] + hrm.bpm)/2; myStatus[12] = (myStatus[12] + hrm.confidence)/2;
        }
      }
     });
  } else {
    isHRM = false; Bangle.setHRMPower(false); 
  }
}

function startLogging() {
    if(recordState == STATE_RECORDING) return;
    recordState = STATE_RECORDING;
    prepareRecording();
    prepHeader();
    HRMSetup();
    accSetup(HZ,GS);
    drawRecordingScreen("00:00");
    Bangle.buzz(500);

    recordingDisplayInterval = setInterval(function(){
        let sec = Math.floor((Date.now()-recordStartTime)/1000);
        let mm = ("0"+Math.floor(sec/60)).substr(-2);
        let ss = ("0"+(sec%60)).substr(-2);
        drawRecordingScreen(mm+":"+ss);
        g.setFont("Vector",18).setColor(1,1,1);
        g.drawString(sampleCount+" samples",120,195);
    },1000);
}

function flushRecordingBuffer() {
  if (accelIdx === 0) return;
  while (accelIdx < PAGE_SIZE) b[accelIdx++] = 0xFF;
  saveToFlash();
}

function recStop() { "ram";
    if (recordState != STATE_RECORDING) return 0;
    if (recordingDisplayInterval) { clearInterval(recordingDisplayInterval); recordingDisplayInterval = undefined; }
    recordStopTime = Date.now();
    flushRecordingBuffer();
    recordState = STATE_FINISHED;
    Bangle.removeListener("accel", accelHandlerRecord);
    let duration = (recordStopTime - recordStartTime) / 1000;
    let rate = sampleCount / duration;
    drawSummaryScreen(rate, duration, sampleCount * 6);
    Bangle.buzz(300);
    return 0;
}

function updateStatus() { "ram";
  if (meanMag>1.275) myStatus[2] = 255; else myStatus[2] = meanMag*200;
  if (meanDiff>1.275) myStatus[3] = 255; else myStatus[3] = meanDiff*200;
  myStatus[9] = Bangle.isCharging()*100+E.getBattery(); myStatus[10] = E.getTemperature(); 
  if (myStatus[9]<2) { Bangle.softOff(); } 
  
  if (recordState == STATE_RECORDING) { 
    storage.write("d20statusmsgs.bin", myStatus, STATUS_SIZE*statusIdx, STATUS_SIZE*1200);
    statusIdx++;
  }
  myStatus[13] = 0xFF; myStatus[12]=0; meanMag=0; meanDiff=0; myStatus[4]=0; myStatus[5]=0;   
  if (HRM_LOGGING) {
    if (Bangle.isCharging()||(myStatus[10]<25)) { isHRM = false; Bangle.setHRMPower(isHRM); } 
    else if (isHRM==false){ isHRM = true; Bangle.setHRMPower(isHRM); }
  }
  if (myStatus[3]>99) actMins[3]++;        
}

function prepareRecording() {
  sampleCount = 0; droppedSamples = 0; recordStartTime = Date.now(); previousSampleTime = recordStartTime; recordStopTime = 0;
  accelIdx = 0; statusIdx = 0; deltaIdx = -1; deltaOn = false; numPages = 0; numFiles = 0;
  prevMSBs.set([0xFF,0xFF,0xFF]); steps = 0;
  for (let i=0;i<4;i++) actMins[i]=0;
  prepHeader();
}

function scheduleRecording(seconds){
    if(recordState!=STATE_READY) return;
    recordState = STATE_WAITING;
    scheduledStartTime = Date.now() + seconds*1000;
    countdownTick();
}

function countdownTick(){
    let remaining = Math.ceil((scheduledStartTime-Date.now())/1000);
    if(remaining<=0){ beginRecording(); return; }
    drawCountdown(remaining);
    if(remaining<=3) Bangle.buzz();
    setTimeout(countdownTick,200);
}

function beginRecording(){
    startLogging();
}

// --- WEB PORTAL UPLOAD HANDSHAKE ENGINE ---
function startUpload() { "ram";
  recStop(); isBusy = true;
  Bangle.setHRMPower(0); isHRM = false; 
  if (bleInt) clearInterval(bleInt); bleInt = 0; 
  outp("uploading...");
  fList = storage.list(/\.bin$/);
  return fList.length;
}

function sendNext(i) { "ram";
  isBusy = true;
  var mydata = new Uint8Array(50);
  Bluetooth.write(fList[i]);
  outp("uploading "+i);
  
  var bsze = 50; 
  if (fList[i] && fList[i][3] == 's') bsze = 14; 
  
  for (var fi=0; fi<FLASHF_SIZE; fi+=bsze) {
    mydata = storage.read(fList[i], fi, bsze);
    var check = 0; 
    for (var ii=0; ii<mydata.length; ii++) { 
      if (mydata[ii] === 0xFF) check++; 
    }
    if (check < mydata.length) { 
      Bluetooth.write(mydata); 
    } else { 
      fi = FLASHF_SIZE; 
    }
    if (fList[i] && (fList[i][3] == 's') && (fi >= 16800)) { 
      fi = FLASHF_SIZE; 
    }
  }
  
  outp("uploaded " + i);
  
  setTimeout(function(){ 
    Bluetooth.write([255,255,255,255,255,0,0,0,0,0,0,255,255,i,fList.length-1]); 
  }, 400);
}

function stpUp(hz,gs,hour) { "ram";
  var settings = require('Storage').readJSON("setting.json", true) || {};
  settings.HZ = hz;
  settings.GS = gs;
  require('Storage').writeJSON("setting.json", settings);
  if (hour<24) {
    setTime(hour*3600);
    startLogHour = hour;
  }
  fList = storage.list(/\.bin$/);
  fList.forEach(f => storage.erase(f));
  storage.compact();
  isBusy = false;
  outp("Ready");
  startActivate();
}

function startActivate() {
  var settings = require('Storage').readJSON("setting.json", true) || {};
  HZ = parseFloat(settings.HZ);
  if (isNaN(HZ)) HZ = 12.5;  
  
  myStatus[9] = Bangle.isCharging()*100+E.getBattery(); myStatus[10] = E.getTemperature(); 
  g.clear();
  
  NRF.removeAllListeners('connect');
  NRF.removeAllListeners('disconnect');

  NRF.on('disconnect', function() {
    isConnected = false;
    myStatus[13] = 18;
  });
  
  NRF.on('connect', function() {
    isConnected = true;
    myStatus[13] = 17;
    NRF.setAdvertising({}); 
    g.setFont("Vector",14).setColor(1,1,0);
    g.clearRect(0, 0, 240, 20); 
    g.drawString("⇆ PC Connected", 120, 10);
  });

  fList = storage.list(/\.bin$/);

  Bangle.removeAllListeners('touch');
  
  // BTN1 listener (Reset OR Open Shutdown Confirm)
  setWatch(function() {
    if (recordState == STATE_FINISHED) {
      setupLeaderState();
    } else if (recordState == STATE_READY) {
      recordState = STATE_SHUTDOWN_CONFIRM;
      drawShutdownConfirmScreen();
    } else if (recordState == STATE_SHUTDOWN_CONFIRM) {
      g.clear();
      g.setFont("Vector",22).setColor(1,0,0).drawString("SHUTTING DOWN...", 120, 120);
      Bangle.buzz(600);
      setTimeout(function() {
        Bangle.softOff();
      }, 1200);
    }
  }, BTN1, {repeat:true, edge:"falling"});

  // BTN2 listener (Broadcast START trigger)
  setWatch(function(){
      if(recordState == STATE_READY){
          // Blast start command signature [0xAA, 0xBB]
          NRF.setAdvertising({},{manufacturer: 0x0590, manufacturerData: [0xAA, 0xBB]}); 
          
          setTimeout(function() {
             NRF.setAdvertising({}); 
          }, 2500);

          Bangle.buzz(200);
          scheduleRecording(5); 
      }
  }, BTN2, {repeat:true, edge:"falling"});

  // BTN3 listener (Broadcast wireless STOP trigger OR Cancel Shutdown Confirm)
  setWatch(function() {
    if (recordState == STATE_RECORDING) {
      Bangle.buzz(150);
      g.clear();
      g.setFontAlign(0,0);
      g.setFont("Vector",22).setColor(1,0,0);
      g.drawString("STOPPING NODES...", 120, 120);
      
      // Blast stop signature [0xCC, 0xDD] for 1.5 seconds so all Followers stop
      NRF.setAdvertising({},{manufacturer: 0x0590, manufacturerData: [0xCC, 0xDD]});
      
      setTimeout(function() {
        NRF.setAdvertising({});
        recStop(); // Now stop recording on the Master locally
      }, 1500);

    } else if (recordState == STATE_SHUTDOWN_CONFIRM) {
      setupLeaderState(); // Cancel and go back to READY
    }
  }, BTN3, {repeat:true, edge:"falling"});

  if (fList.length > 0) {
    g.clear();
    g.setFont("Vector",20).setColor(1,1,1);
    g.drawString("Recording found",20,80);
    g.drawString("BTN1=Delete",20,120);
    g.drawString("BTN3=Keep",20,150);

    setWatch(function() {
      g.clear();
      fList.forEach(f => storage.erase(f));
      storage.compact();
      setupLeaderState();
    }, BTN1, {repeat:false, edge:"falling"});

    setWatch(function() { setupLeaderState(); }, BTN3, {repeat:false, edge:"falling"});
    return;
  }

  setupLeaderState();
}

function setupLeaderState() {
  recordState = STATE_READY;
  steps = 0;
  for (var i=0; i<4; i++) actMins[i]=0;
  if (!bleInt) bleInt = setInterval(updateStatus, 60000);
  Bangle.setLCDPower(true);
  
  prevMSBs.set([0xFF,0xFF,0xFF]);
  accelIdx = 0; statusIdx = 0; deltaIdx = -1; deltaOn=false;
  numPages = 0; numFiles = 0;
  
  HRMSetup();
  accSetup(HZ,GS);
  drawReadyScreen();
  prepHeader(); 
  isBusy = false;
}

startActivate();
