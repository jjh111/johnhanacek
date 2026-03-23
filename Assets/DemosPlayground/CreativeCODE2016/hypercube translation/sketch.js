var Tesseract; 
var tesseract;
var lines = [];
 
function setup(){
  createCanvas(1000,1000);
  stroke(255);
  strokeWeight(2);
  var k=0;

  tesseract = new Tesseract();
}
 
function draw(){
  background (0);
  push();
   
  translate(mouseX, mouseY);
   
  tesseract.display();
  pop();
   
  if (mouseX < 500) tesseract.turn(0,1,.01);
  if (mouseY < 500) tesseract.turn(0,2,.01);
  if (mouseY == 500 ) tesseract.turn(1,2,.01);
  if (mouseX > 500) tesseract.turn(0,3,.01);
  if (mouseY > 500) tesseract.turn(1,3,.01);
  if (mouseX == 500) tesseract.turn(2,3,.01);
}
 
function mousePressed(){

  tesseract = new Tesseract();
}
 
function mouseReleased(){

}
 
function Tesseract(){
  var lines = new Array;
  float (mouseX, mouseY, z, w, perspZ, perspW, size);
   
  Tesseract(){
    size=width/24;
    z=5;
    w=1;
    perspZ=4;
    perspW=1;
     
    var temp=[];
    [ x:  1, y:  1, z:  1, w:  1 ],
    [ x:  1, y:  1, z:  1, w: -1 ],
    [ x:  1, y:  1, z: -1, w:  1 ],
    [ x:  1, y:  1, z: -1, w: -1 ],
    [ x:  1, y: -1, z:  1, w:  1 ],
    [ x:  1, y: -1, z:  1, w: -1 ],
    [ x:  1, y: -1, z: -1, w:  1 ],
    [ x:  1, y: -1, z: -1, w: -1 ],
    [ x: -1, y:  1, z:  1, w:  1 ],
    [ x: -1, y:  1, z:  1, w: -1 ],
    [ x: -1, y:  1, z: -1, w:  1 ],
    [ x: -1, y:  1, z: -1, w: -1 ],
    [x: -1, y: -1, z:  1, w:  1 ],
    [ x: -1, y: -1, z:  1, w: -1 ],
    [ x: -1, y: -1, z: -1, w:  1 ],
    [ x: -1, y: -1, z: -1, w: -1 ]
      
    
     
    lines=temp;
  }
   
  function turn(var a, var b, float deg){
    float[] temp;
    for (var j=0; j<2; j++)
      for (var i=0; i<32; i++){
        temp=lines[i][j];
        lines[i][j][a]=temp[a]*cos(deg)+temp[b]*sin(deg);
        lines[i][j][b]=temp[b]*cos(deg)-temp[a]*sin(deg);
      }
  }
   
  function persp(float[][][] arr){
    for (var j=0; j<2; j++)
      for (var i=0; i<32; i++){
        arr[i][j][0]=arr[i][j][0]+(arr[i][j][0]+mouseX)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
        arr[i][j][1]=arr[i][j][1]+(arr[i][j][1]+mouseY)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
      }
  }
   
  function resize(float[][][] arr){
    for (var i=0; i<32; i++)
      for (var j=0; j<2; j++)
        for (var k=0; k<4; k++)
          arr[i][j][k]*=size;
  }
   
  void display(){
    float[][][] temp = new float[32][2][4];
    for (var i=0; i<32; i++)
      for (var j=0; j<2; j++)
        for (var k=0; k<4; k++)
          temp[i][j][k]=lines[i][j][k];
    persp(temp);
    resize(temp);
    for (var i=0; i<32; i++)
      line(temp[i][0][0],temp[i][0][1],temp[i][1][0],temp[i][1][1]);
  }
}
