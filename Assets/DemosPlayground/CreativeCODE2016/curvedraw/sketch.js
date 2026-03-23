"use strict";
var strokes = []; // contains arrays that contain Vectors
var currentStrokeIndex = 0;
var brushSlider;
function setup() {
  createCanvas(windowWidth, windowHeight);
  
colorMode(RGB, 255);
  fill(0);
  noStroke();
  //textSize(42);
  //textAlign(CENTER);
  brushSlider = createSlider(1,22,4);
  brushSlider.position(25,25)
}
function draw() {
  background(0.97);
  strokeWeight(brushSlider.value());
  stroke(Math.floor((Math.random() * 255) + 1), Math.floor((Math.random() * 255) + 1), Math.floor((Math.random() * 255) + 1));
  push();
  {
    //fill(0.9);
    //text("«Eine Linie ist ein Punkt,\nder spazieren geht.»\n–Paul Klee", width/2, height/2);
  }
  pop();
  for (var i = 0; i < strokes.length; i++) {
    var s = strokes[i];
    push();
    {
      var r = 3;
      for (var j = 0; j < s.length; j++) {
        var p = s[j];
        // default mode: center(x,y), w, h
        //ellipse(p.x, p.y, 2*r, 2*r);
      }
    }
    pop();
    
    push();
    {
      noFill();
      //stroke(.1);
      //stroke(30,40,50);
      //stroke(Math.floor((Math.random() * 255) + 1), Math.floor((Math.random() * 255) + 1), Math.floor((Math.random() * 255) + 1));
      beginShape();
        for (var j = 0; j < s.length; j++) {
          var p = s[j];
          curveVertex(p.x, p.y);
          // "The first and last points in a series of curveVertex() lines will be used to guide the beginning and end of a the curve.
          // A minimum of four points is required to draw a tiny curve between the second and third points."
          // http://p5js.org/reference/#/p5/curveVertex
          if (j == 0 || j == s.length - 2) {
            curveVertex(p.x, p.y);
          }
        }
      endShape();
    }
    pop();
  }
}
function mousePressed() {
  strokes[currentStrokeIndex] = [createVector(mouseX, mouseY)];
}
function mouseReleased() {
  currentStrokeIndex++;
}
function mouseDragged() {
  strokes[currentStrokeIndex].push(createVector(mouseX, mouseY));
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}