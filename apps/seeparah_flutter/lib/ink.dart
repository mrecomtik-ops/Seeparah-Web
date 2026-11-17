import 'dart:convert';
import 'package:flutter/material.dart';
import 'local_library.dart';

/// Page-local hand-drawn notes. All point positions are stored as fractions
/// of the content panel size; removing/undoing ink never modifies source text.
class InkStroke {
  InkStroke(this.color,this.points);
  final Color color;
  final List<Offset> points;
  Map<String,dynamic> toJson()=>{'color':color.toARGB32(),
    'points':points.map((p)=>[p.dx,p.dy]).toList()};
  factory InkStroke.fromJson(Map<String,dynamic> json)=>InkStroke(
    Color(json['color'] as int),
    (json['points'] as List<dynamic>).map((value){
      final pair=value as List<dynamic>;
      return Offset((pair[0] as num).toDouble(),(pair[1] as num).toDouble());
    }).toList());
}

class InkBoard extends StatefulWidget{
  const InkBoard({super.key,required this.local,required this.bookId,
    required this.language,required this.index,required this.child});
  final LocalLibrary local;
  final String bookId,language;
  final int index;
  final Widget child;
  @override State<InkBoard> createState()=>_InkBoardState();
}
class _InkBoardState extends State<InkBoard>{
  final strokes=<InkStroke>[];
  InkStroke? active;
  bool pen=false,eraser=false;
  Color color=const Color(0xAAAF8132);
  String get keyName=>'ink:'+widget.bookId+':'+widget.language+':'+widget.index.toString();
  @override void initState(){
    super.initState();
    final raw=widget.local.prefs.getString(keyName);
    if(raw!=null){
      try{
        final value=jsonDecode(raw) as List<dynamic>;
        strokes.addAll(value.take(200).map((x)=>InkStroke.fromJson(
          Map<String,dynamic>.from(x as Map))));
      }catch(_){/* corrupted local ink is never read as source text */}
    }
  }
  void persist(){
    widget.local.prefs.setString(keyName,jsonEncode(
      strokes.map((x)=>x.toJson()).toList()));
  }
  Offset normalized(Offset p,Size size)=>Offset(
    (p.dx/size.width).clamp(0.0,1.0),
    (p.dy/size.height).clamp(0.0,1.0));
  void begin(Offset point,Size size){
    final p=normalized(point,size);
    if(eraser){
      const maxDistance=.045;
      strokes.removeWhere((stroke)=>stroke.points.any(
        (x)=>(x-p).distance<maxDistance));
      persist();setState((){});
    }else{
      active=InkStroke(color,[p]);setState((){});
    }
  }
  void move(Offset point,Size size){
    if(active==null||eraser)return;
    if(active!.points.length>1200)return;
    active!.points.add(normalized(point,size));setState((){});
  }
  void end(){
    if(active!=null){
      if(strokes.length>=200)strokes.removeAt(0);
      strokes.add(active!);active=null;
      persist();setState((){});
    }
  }
  @override Widget build(BuildContext context)=>Column(
    crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      Wrap(spacing:2,children:[
        IconButton(
          tooltip:pen?'Turn off handwriting':'Write or draw on this page',
          icon:Icon(Icons.edit,color:pen&&!eraser?Colors.teal:null),
          onPressed:()=>setState((){pen=!pen;eraser=false;})),
        IconButton(
          tooltip:'Erase a stroke',
          icon:Icon(Icons.auto_fix_normal,color:eraser?Colors.teal:null),
          onPressed:()=>setState((){eraser=!eraser;pen=eraser;})),
        if(pen&&!eraser)
          ...[const Color(0xAAAF8132),const Color(0xAA207A72),
            const Color(0xAA9E4775)].map((shade)=>IconButton(
              tooltip:'Choose ink color',onPressed:()=>setState(()=>color=shade),
              icon:Icon(Icons.circle,color:shade,size:18))),
        IconButton(tooltip:'Undo last stroke',
          onPressed:strokes.isEmpty?null:(){
            strokes.removeLast();persist();setState((){});
          },
          icon:const Icon(Icons.undo)),
        if(strokes.isNotEmpty)
          IconButton(tooltip:'Clear page ink',icon:const Icon(Icons.delete_outline),
            onPressed:(){
              strokes.clear();persist();setState((){});
            }),
        if(pen)const Padding(padding:EdgeInsets.all(9),
          child:Text('Draw mode',style:TextStyle(fontSize:12))),
      ]),
      LayoutBuilder(builder:(context,layout){
        // The source text establishes the stack height. Avoid force expanding
        // the hit target across the entire scroll viewport.
        return Stack(children:[
          widget.child,
          Positioned.fill(child:IgnorePointer(
            child:CustomPaint(painter:InkPainter([...strokes,if(active!=null)active!])))),
          if(pen)Positioned.fill(child:GestureDetector(
            behavior:HitTestBehavior.opaque,
            onPanStart:(d)=>begin(d.localPosition,
              Size(layout.maxWidth,_estimatedHeight(context))),
            onPanUpdate:(d)=>move(d.localPosition,
              Size(layout.maxWidth,_estimatedHeight(context))),
            onPanEnd:(_)=>end(),
          )),
        ]);
      }),
    ],
  );
  double _estimatedHeight(BuildContext context){
    final box=context.findRenderObject();
    if(box is RenderBox&&box.hasSize&&box.size.height>0){
      return box.size.height;
    }
    return 600;
  }
}

class InkPainter extends CustomPainter{
  InkPainter(this.strokes);
  final List<InkStroke> strokes;
  @override void paint(Canvas canvas,Size size){
    for(final stroke in strokes){
      if(stroke.points.isEmpty)continue;
      final brush=Paint()..color=stroke.color..style=PaintingStyle.stroke
        ..strokeWidth=3.4..strokeCap=StrokeCap.round
        ..strokeJoin=StrokeJoin.round;
      final path=Path();
      for(var i=0;i<stroke.points.length;i++){
        final p=stroke.points[i];
        final x=p.dx*size.width,y=p.dy*size.height;
        if(i==0){path.moveTo(x,y);}else{path.lineTo(x,y);}
      }
      canvas.drawPath(path,brush);
    }
  }
  @override bool shouldRepaint(covariant InkPainter old)=>true;
}
