import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';

class RunDetailScreen extends StatelessWidget {
  final String runId;

  const RunDetailScreen({super.key, required this.runId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Run Detail'),
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance.collection('runs').doc(runId).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final run = snapshot.data!.data() as Map<String, dynamic>;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _StatusCard(status: run['status']),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Summary', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text(run['summaryText'] ?? 'No summary'),
                        const SizedBox(height: 16),
                        Text('Started: ${_formatTimestamp(run['startedAt'])}'),
                        Text('Completed: ${_formatTimestamp(run['completedAt'])}'),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                if (run['extractedValues'] != null && (run['extractedValues'] as Map).isNotEmpty) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Extracted Values', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          ...(run['extractedValues'] as Map).entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Text('${e.key}: ${e.value}'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (run['artifactPaths']?['screenshots'] != null) ...[
                  const Text('Screenshots', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  _ScreenshotsGallery(screenshots: List<String>.from(run['artifactPaths']['screenshots'])),
                  const SizedBox(height: 16),
                ],
                if (run['artifactPaths']?['logs'] != null) ...[
                  ElevatedButton.icon(
                    onPressed: () => _viewLogs(context, run['artifactPaths']['logs']),
                    icon: const Icon(Icons.description),
                    label: const Text('View Logs'),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  String _formatTimestamp(int? timestamp) {
    if (timestamp == null) return 'Unknown';
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}:${date.second.toString().padLeft(2, '0')}';
  }

  Future<void> _viewLogs(BuildContext context, String logsPath) async {
    try {
      final ref = FirebaseStorage.instance.ref(logsPath);
      final url = await ref.getDownloadURL();

      // In a real app, fetch and display the logs
      // For now, just show the URL
      if (context.mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Logs'),
            content: SelectableText('Download URL: $url'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load logs: $e')),
        );
      }
    }
  }
}

class _StatusCard extends StatelessWidget {
  final String? status;

  const _StatusCard({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    IconData icon;

    switch (status) {
      case 'SUCCESS':
        color = Colors.green;
        icon = Icons.check_circle;
        break;
      case 'FAIL':
        color = Colors.red;
        icon = Icons.error;
        break;
      case 'BLOCKED':
        color = Colors.orange;
        icon = Icons.block;
        break;
      case 'TIMEOUT':
        color = Colors.purple;
        icon = Icons.timer_off;
        break;
      default:
        color = Colors.grey;
        icon = Icons.help;
    }

    return Card(
      color: color.withOpacity(0.1),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: color, size: 48),
            const SizedBox(width: 16),
            Text(
              status ?? 'UNKNOWN',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScreenshotsGallery extends StatelessWidget {
  final List<String> screenshots;

  const _ScreenshotsGallery({required this.screenshots});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 200,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: screenshots.length,
        itemBuilder: (context, index) {
          return FutureBuilder<String>(
            future: FirebaseStorage.instance.ref(screenshots[index]).getDownloadURL(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const SizedBox(
                  width: 150,
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GestureDetector(
                  onTap: () {
                    showDialog(
                      context: context,
                      builder: (context) => Dialog(
                        child: Image.network(snapshot.data!),
                      ),
                    );
                  },
                  child: Image.network(
                    snapshot.data!,
                    width: 150,
                    fit: BoxFit.cover,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
