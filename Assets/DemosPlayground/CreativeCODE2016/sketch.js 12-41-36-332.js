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
var soundCurve = pow(2, 7);
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

function setup() {
  frameRate(24);
  createCanvas(1500, 1000);
  noCursor();
  img = loadImage("assets/halfalone.png")
  fill(0);
  noStroke();
  rect(0, 0, width, height);
  osc = new p5.TriOsc(); // set frequency and type
  osc.amp(.5);

  fft = new p5.FFT();
  osc.start();
  starpoints(); //drawing star points
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
  var freq = map(soundCurve, 0, width, 100, 900);
  osc.freq(freq);

  //mouseY
  var amp = map(alphaVal, 0, height, 1, .01);
  osc.amp(amp);

  if (mouseIsPressed) {
    var fs = fullScreen();
    fullScreen(!fs);
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
    fill(255, invAlpha);
    ellipse(mouseX, mouseY, 10, 10);
  }

  if (mouseIsPressed == false) {
    radius = 0.01; //reset explosion for next mousepressed event
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

  stroke(244, 233, 202, alphaVal - 100);
  strokeWeight(10);

  fill(244, 233, 202, alphaVal - 70);
  ellipse(mouseX, mouseY, radius * sin(radius++), radius * sin(radius++));

  fill(172, 227, 219, alphaVal - 70);
  ellipse(mouseX, mouseY, radius * 2 * cos(radius++), radius * 2 * cos(radius++));

  fill(102, 45, 145, alphaVal - 200);
  ellipse(mouseX, mouseY, radius * 8, radius * 8);

  sin(radius++); //these on together give a wave pattern to explosion
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