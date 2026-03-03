Toggle buttonXY, buttonXZ, buttonYZ, buttonXW, buttonYW, buttonZW;
Tesseract tesseract;
 
void setup(){
  size(640,640);
  stroke(255);
  strokeWeight(2);
  float w12=width/12.,w6=width/6.,h12=height/12.,h24=height/24.;
  int k=0;
  buttonXY = new Toggle(w12+w6*k++,height-h24,w6,h12,"XY");
  buttonXZ = new Toggle(w12+w6*k++,height-h24,w6,h12,"XZ");
  buttonYZ = new Toggle(w12+w6*k++,height-h24,w6,h12,"YZ");
  buttonXW = new Toggle(w12+w6*k++,height-h24,w6,h12,"XW");
  buttonYW = new Toggle(w12+w6*k++,height-h24,w6,h12,"YW");
  buttonZW = new Toggle(w12+w6*k++,height-h24,w6,h12,"ZW");
  tesseract = new Tesseract();
}
 
void draw(){
  background (0);
  pushMatrix();
   
  buttonXY.display();
  buttonXZ.display();
  buttonYZ.display();
  buttonXW.display();
  buttonYW.display();
  buttonZW.display();
   
  translate(width/2, height/2);
   
  tesseract.display();
  popMatrix();
   
  if (buttonXY.pressed) tesseract.turn(0,1,.01);
  if (buttonXZ.pressed) tesseract.turn(0,2,.01);
  if (buttonYZ.pressed) tesseract.turn(1,2,.01);
  if (buttonXW.pressed) tesseract.turn(0,3,.01);
  if (buttonYW.pressed) tesseract.turn(1,3,.01);
  if (buttonZW.pressed) tesseract.turn(2,3,.01);
}
 
void mousePressed(){
  buttonXY.press(mouseX,mouseY);
  buttonXZ.press(mouseX,mouseY);
  buttonYZ.press(mouseX,mouseY);
  buttonXW.press(mouseX,mouseY);
  buttonYW.press(mouseX,mouseY);
  buttonZW.press(mouseX,mouseY);
  if (mouseY<height-buttonXY.w) tesseract = new Tesseract();
}
 
void mouseReleased(){
  buttonXY.press(mouseX,mouseY);
  buttonXZ.press(mouseX,mouseY);
  buttonYZ.press(mouseX,mouseY);
  buttonXW.press(mouseX,mouseY);
  buttonYW.press(mouseX,mouseY);
  buttonZW.press(mouseX,mouseY);
}
 
class Tesseract{
  float[][][] lines;
  float x, y, z, w, perspZ, perspW, size;
   
  Tesseract(){
    size=width/24;
    z=5;
    w=1;
    perspZ=4;
    perspW=1;
     
    float[][][] temp={
    {{1,1,1,1},{-1, 1, 1, 1}},
    {{1,1,1,1},{ 1,-1, 1, 1}},
    {{1,1,1,1},{ 1, 1,-1, 1}},
    {{1,1,1,1},{ 1, 1, 1,-1}},
     
    {{-1,-1,1,1},{ 1,-1, 1, 1}},
    {{-1,-1,1,1},{-1, 1, 1, 1}},
    {{-1,-1,1,1},{-1,-1,-1, 1}},
    {{-1,-1,1,1},{-1,-1, 1,-1}},
     
    {{-1,1,-1,1},{ 1, 1,-1, 1}},
    {{-1,1,-1,1},{-1,-1,-1, 1}},
    {{-1,1,-1,1},{-1, 1, 1, 1}},
    {{-1,1,-1,1},{-1, 1,-1,-1}},
     
    {{-1,1,1,-1},{ 1, 1, 1,-1}},
    {{-1,1,1,-1},{-1,-1, 1,-1}},
    {{-1,1,1,-1},{-1, 1,-1,-1}},
    {{-1,1,1,-1},{-1, 1, 1, 1}},
     
    {{1,-1,-1,1},{-1,-1,-1, 1}},
    {{1,-1,-1,1},{ 1, 1,-1, 1}},
    {{1,-1,-1,1},{ 1,-1, 1, 1}},
    {{1,-1,-1,1},{ 1,-1,-1,-1}},
     
    {{1,-1,1,-1},{-1,-1, 1,-1}},
    {{1,-1,1,-1},{ 1, 1, 1,-1}},
    {{1,-1,1,-1},{ 1,-1,-1,-1}},
    {{1,-1,1,-1},{ 1,-1, 1, 1}},
     
    {{1,1,-1,-1},{-1, 1,-1,-1}},
    {{1,1,-1,-1},{ 1,-1,-1,-1}},
    {{1,1,-1,-1},{ 1, 1, 1,-1}},
    {{1,1,-1,-1},{ 1, 1,-1, 1}},
     
    {{-1,-1,-1,-1},{ 1,-1,-1,-1}},
    {{-1,-1,-1,-1},{-1, 1,-1,-1}},
    {{-1,-1,-1,-1},{-1,-1, 1,-1}},
    {{-1,-1,-1,-1},{-1,-1,-1, 1}}};
     
    lines=temp;
  }
   
  void turn(int a, int b, float deg){
    float[] temp;
    for (int j=0; j<2; j++)
      for (int i=0; i<32; i++){
        temp=lines[i][j];
        lines[i][j][a]=temp[a]*cos(deg)+temp[b]*sin(deg);
        lines[i][j][b]=temp[b]*cos(deg)-temp[a]*sin(deg);
      }
  }
   
  void persp(float[][][] arr){
    for (int j=0; j<2; j++)
      for (int i=0; i<32; i++){
        arr[i][j][0]=arr[i][j][0]+(arr[i][j][0]+x)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
        arr[i][j][1]=arr[i][j][1]+(arr[i][j][1]+y)*((arr[i][j][2]+z)/perspZ+(arr[i][j][3]+w)/perspW);
      }
  }
   
  void resize(float[][][] arr){
    for (int i=0; i<32; i++)
      for (int j=0; j<2; j++)
        for (int k=0; k<4; k++)
          arr[i][j][k]*=size;
  }
   
  void display(){
    float[][][] temp = new float[32][2][4];
    for (int i=0; i<32; i++)
      for (int j=0; j<2; j++)
        for (int k=0; k<4; k++)
          temp[i][j][k]=lines[i][j][k];
    persp(temp);
    resize(temp);
    for (int i=0; i<32; i++)
      line(temp[i][0][0],temp[i][0][1],temp[i][1][0],temp[i][1][1]);
  }
}
 
class Button{
  boolean pressed;
  float x,y,w,h;
  final float cDiff=100,c=255/2,txtc=255;
  String txt;
   
  Button(float x, float y, float w, float h, String txt){
    this.x=x; this.y=y; this.w=w;
    this.h=h; this.txt=txt;
  }
   
  void press(float mx, float my){
    pressed = (abs(mx-x)<w/2)&&(abs(my-y)<h/2)&&(mousePressed);
  }
   
  void display(){
    pushMatrix();
    pushStyle();
     
    rectMode(CENTER);
    textAlign(CENTER,CENTER);
    stroke(0);
    strokeWeight(3);
     
    if (pressed) fill(c-cDiff);
    else fill(c);
     
    rect(x,y,w,h);
     
    if (pressed) fill(txtc-cDiff);
    else fill(txtc);
     
    textSize(h*2/3);
    text(txt,x,y);
     
    popStyle();
    popMatrix();
  }
}
 
class Toggle extends Button{
  boolean pushed;
   
  Toggle(float x, float y, float w, float h, String text){
    super(x, y, w, h, text);
  }
   
  void press(float mx, float my){
    pushed = (abs(mx-x)<w/2)&&(abs(my-y)<h/2)&&(mousePressed);
    if (pushed) pressed = !pressed;
  }
}