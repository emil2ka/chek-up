import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/store.dart';
import 'screens/shell.dart';
import 'ui/kit.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
  store.onToast = showToast;
  await store.load();
  // вернулся в приложение — подтянуть изменения с другого устройства
  AppLifecycleListener(onResume: () => store.syncSoon());
  runApp(const ChekUpApp());
}

class ChekUpApp extends StatelessWidget {
  const ChekUpApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Чек-ап',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      fontFamily: 'Manrope',
      colorScheme: ColorScheme.fromSeed(seedColor: blue1, primary: blue1),
      scaffoldBackgroundColor: blue1,
      splashFactory: NoSplash.splashFactory,
    ),
    // на широком экране (браузер, планшет) приложение остаётся «телефоном» по центру
    builder: (context, child) => ColoredBox(
      color: ink,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: ClipRect(child: ToastHost(child: child!)),
        ),
      ),
    ),
    home: const Shell(),
  );
}
