import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const QuotaApp());
}

class QuotaApp extends StatelessWidget {
  const QuotaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Quota Controller',
      theme: ThemeData.dark(),
      home: const QuotaScreen(),
    );
  }
}

class QuotaScreen extends StatefulWidget {
  const QuotaScreen({super.key});

  @override
  State<QuotaScreen> createState() => _QuotaScreenState();
}

class _QuotaScreenState extends State<QuotaScreen> {
  final String user = "user1";
  final String baseUrl = "http://localhost:5000/api";

  int maxDownloads = 0;
  int usedDownloads = 0;
  int remaining = 0;
  bool isBlocked = false;

  final TextEditingController limitController = TextEditingController();

  @override
  void initState() {
    super.initState();
    getQuota();
  }

  // ✅ GET QUOTA
  Future<void> getQuota() async {
    try {
      final response =
      await http.get(Uri.parse("$baseUrl/quota/$user"));

      final data = jsonDecode(response.body);

      setState(() {
        maxDownloads = data["maxDownloads"];
        usedDownloads = data["usedDownloads"];
        remaining = data["remaining"];
        isBlocked = data["isBlocked"];
      });
    } catch (e) {
      debugPrint("Error fetching quota: $e");
    }
  }

  // ✅ RESET QUOTA
  Future<void> resetQuota() async {
    await http.post(Uri.parse("$baseUrl/quota/reset/$user"));
    getQuota();
  }

  // ✅ SET LIMIT
  Future<void> setLimit(int newLimit) async {
    await http.post(
      Uri.parse("$baseUrl/quota/set-limit/$user"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"maxDownloads": newLimit}),
    );
    getQuota();
  }

  Widget buildCard(String title, String value, Color color) {
    return Card(
      color: color.withOpacity(0.15),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(title, style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                  fontSize: 22, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Quota Controller"),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: getQuota,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [

            const SizedBox(height: 10),

            buildCard("User", user, Colors.blue),
            buildCard("Max Downloads", "$maxDownloads", Colors.green),
            buildCard("Used Downloads", "$usedDownloads", Colors.orange),
            buildCard("Remaining", "$remaining", Colors.purple),

            const SizedBox(height: 20),

            Card(
              color: isBlocked ? Colors.red.withOpacity(0.2) : Colors.green.withOpacity(0.2),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  isBlocked ? "🚫 BLOCKED" : "✅ ACTIVE",
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
            ),

            const SizedBox(height: 30),

            ElevatedButton(
              onPressed: resetQuota,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                padding: const EdgeInsets.all(14),
              ),
              child: const Text("Reset Downloads"),
            ),

            const SizedBox(height: 20),

            TextField(
              controller: limitController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: "New Max Limit",
                border: OutlineInputBorder(),
              ),
            ),

            const SizedBox(height: 10),

            ElevatedButton(
              onPressed: () {
                final newLimit =
                int.tryParse(limitController.text);

                if (newLimit != null) {
                  setLimit(newLimit);
                  limitController.clear();
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                padding: const EdgeInsets.all(14),
              ),
              child: const Text("Set Limit"),
            ),

            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }
}