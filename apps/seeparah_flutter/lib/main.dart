import 'package:flutter/material.dart';
import 'api.dart';
import 'local_library.dart';
import 'screens.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final library = await LocalLibrary.open();
  runApp(SeeparahApp(api:SeeparahApi(),library:library));
}

class SeeparahApp extends StatelessWidget {
  const SeeparahApp({super.key,required this.api,required this.library});
  final SeeparahApi api;
  final LocalLibrary library;

  @override Widget build(BuildContext context){
    const emerald=Color(0xFF174F41);
    const parchment=Color(0xFFFAF8F1);
    return MaterialApp(
      title:'Seeparah — Read freely',
      debugShowCheckedModeBanner:false,
      theme:ThemeData(
        useMaterial3:true,
        colorScheme:ColorScheme.fromSeed(seedColor:emerald,
          primary:emerald,surface:parchment,secondary:const Color(0xFFB48A49)),
        scaffoldBackgroundColor:parchment,
        appBarTheme:const AppBarTheme(backgroundColor:parchment,
          foregroundColor:emerald,centerTitle:false,scrolledUnderElevation:0),
        cardTheme:const CardThemeData(elevation:0,color:Colors.white),
        textTheme:Typography.blackCupertino.copyWith(
          titleLarge:const TextStyle(color:emerald,fontSize:24,
            fontWeight:FontWeight.w700,fontFamily:'serif'),
        ),
      ),
      home:HomeShell(api:api,library:library),
    );
  }
}
