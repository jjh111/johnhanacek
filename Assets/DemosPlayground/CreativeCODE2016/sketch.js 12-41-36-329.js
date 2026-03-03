/*"Influence" by John Hanacek
 1/1/2016
 Georgetown Communication, Culture & Technology
 For class: Expressive Computation, taught by Garrison LeMasters
 */

var img; //front cutout of person standing
var radius = 0;
var grow = 0;
var alphaVal = 255;
var invAlpha = 0;
var pass = 0;
var flash = 255;
var forwardX = 0;
var forwardY = 0;
var xPos = [3000];
var yPos = [3000];
var s = [3000];
var a = 0;
var b = 0;
var c = 100;
var p = 10;
var value = 0;
var sky = 30;

var attackLevel = 2.0;
var releaseLevel = 0;

var attackTime = 0.001
var decayTime = 0.3;
var susPercent = 0.2;
var releaseTime = 0.5;

var env, env1, sinOsc;

var carrier; // this is the oscillator we will hear
var modulator; // this oscillator will modulate the frequency of the carrier

var analyzer; // we'll use this visualize the waveform 

// the carrier frequency pre-modulation
var carrierBaseFreq = 200;

// min/max ranges for modulator
var modMaxFreq = 0;
var modMinFreq = -10;
var modMaxDepth = 100;
var modMinDepth = 20;

function setup() {
  frameRate(24);
  cnv = createCanvas(1500, 883);
  noCursor();
  img = loadImage("assets/halfalonec.png")
  fill(0);
  noStroke();
  rect(0, 0, width, height);
  starpoints(); //drawing star points

  env = new p5.Env();
  env.setADSR(attackTime, decayTime, susPercent, releaseTime);
  env.setRange(attackLevel, releaseLevel);

  //triOsc = new p5.Oscillator('triangle');
  //triOsc.amp(env);
  //triOsc.start();
  //triOsc.freq(100);


  carrier = new p5.Oscillator('sine');
  carrier.amp(0); // set amplitude
  carrier.freq(carrierBaseFreq); // set frequency
  carrier.start(); // start oscillating

  // try changing the type to 'square', 'sine' or 'triangle'
  modulator = new p5.Oscillator('sine');
  modulator.start();

  // add the modulator's output to modulate the carrier's frequency
  modulator.disconnect();
  carrier.freq(modulator);

  // create an FFT to analyze the audio
  analyzer = new p5.FFT();

}

function playEnv() {
  env.play();

}

function draw() {
  fill(255);
  for (var i = 0; i < 3000; i++) {
    noStroke();
    ellipse(xPos[i], yPos[i], s[i], s[i]);
  }
  fill(0, sky);
  noStroke();
  rect(0, 0, width, height);
  fill(110, 14, 105, 45);
  noStroke();
  rect(0, 0, width, height);


  var locY = (mouseY / height - 0.5) * (-2);
  var locX = (mouseX / width - 0.5) * 2;


  // map mouseY to modulator freq between a maximum and minimum frequency
  var modFreq = map(mouseY, height / -2, 0, modMinFreq, modMaxFreq); //-9

  modulator.freq(modFreq);

  //println(modFreq);

  // change the amplitude of the modulator
  // negative amp reverses the sawtooth waveform, and sounds percussive
  var modDepth = map(mouseX, 0, width / 2, 0, modMinDepth, modMaxDepth); //84
  modulator.amp(modDepth);
  //println(modDepth);

  if (mouseIsPressed == true) {
    playEnv();
    carrier.amp(1.0, 0.01);
    grow = pow(pass++, 6);
    for (var i = 0; i < 25; i = i + 1); {
      alphaVal = alphaVal - 1;
      invAlpha = invAlpha + 1;
      flash = flash - 70;
      sky = sky - 1;
    }
    drawCircle();
    explosion(); //calling the retro looking explosion circles
    tracker(); //twinkles
    fill(255, invAlpha - 10);

    ellipse(mouseX, mouseY, 10, 10);
  }
 

  if (mouseIsPressed == false) {

    carrier.amp(0.0, 0.02);
    radius = 0; //reset explosion for next mousepressed event
    alphaVal = 255;
    invAlpha = 0;
    sky = 60;
    grow = random(2, 12);
    pass = 12;
    flash = 255;
    fill(255, random(235, 255));
    ellipse(mouseX, mouseY, grow, grow);
  }
  

  image(img, 0, 0, img.width / 2, img.height / 2);
}

//drawing explosion
function drawCircle() {
  //translate(width/2, height/3); //centers explosion 
  fill(255, flash);
  ellipse(mouseX, mouseY, grow, grow);
}

function explosion() {
  var modF = map(mouseY, height / -2, 0, modMinFreq, modMaxFreq);
  println(modF);
  
  var modD = map(mouseX, 0, width / 2, 0, modMinDepth, modMaxDepth);

  //stroke(244, 233, 202, alphaVal - 100);
  stroke(244, 233, 202, 30);
  strokeWeight(10);

  //fill(244, 233, 202, alphaVal - 70);
  fill(244, 233, 202, 60);
  //ellipse(mouseX, mouseY, modF *10* sin(radius++), modF *10* sin(radius++));

  ellipse(mouseX, mouseY, radius * sin(modD++), radius * sin(modF++));

  //fill(172, 227, 219, alphaVal - 70);
  fill(172, 227, 219, 70);
  ellipse(mouseX, mouseY, modF * 29 * cos(radius++), modF * 29 * cos(radius++));

  fill(102, 45, 145, alphaVal - 200);
  ellipse(mouseX, mouseY, radius * 8, radius * 8);

  //sin(radius++); //these on together give a wave pattern to explosion
  sin(radius++); //comment out one of these to make explosion circular
}

function starpoints() {
  strokeWeight(3); //protecting stars from drawcircle strokeweight
  //locations of stars
  for (var i = 0; i < 2500; i++) {
    xPos[i] = random(0, width);
  }
  for (var i = 0; i < 2500; i++) {
    yPos[i] = random(0, height);
  }

  //size of stars
  for (var i = 0; i < 2500; i++) {
    s[i] = random(0, 5);
  }
}

//draws twinkles

function tracker() {
  strokeWeight(3); //protecting from drawcircle strokeweight
  noStroke();
  line(a, b, c, a);
  a = a + 3;
  if (a == 600) {
    a = 0;
    c = c + 100;
    b = b + 100;
  }

  stroke(244, 233, 202, invAlpha);
  for (var i = 0; i < 250; i++) {
    line(xPos[i] + p, yPos[i], xPos[i], yPos[i]);
    line(xPos[i], yPos[i] + p, xPos[i], yPos[i]);
    line(xPos[i], yPos[i], xPos[i] - p, yPos[i]);
    line(xPos[i], yPos[i], xPos[i], yPos[i] - p);
    if (a > yPos[i] - 25) {
      p = 5;
    }
    if (a < yPos[i] + 25) {
      p = 5;
    }
    if (a < yPos[i] - 25) {
      p = 0;
    }
    if (a > yPos[i] + 25) {
      p = 0;
    }
    i = i + 1;
  }
}