import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/auth_service.dart';
import 'task_detail_screen.dart';

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authService = Provider.of<AuthService>(context);
    final userId = authService.userId!;

    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('tasks')
            .where('ownerUserId', isEqualTo: userId)
            .orderBy('updatedAt', descending: true)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final tasks = snapshot.data?.docs ?? [];

          if (tasks.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.task, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  const Text('No tasks yet', style: TextStyle(fontSize: 18, color: Colors.grey)),
                  const SizedBox(height: 8),
                  const Text('Create your first automation task', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: () => _createNewTask(context, userId),
                    icon: const Icon(Icons.add),
                    label: const Text('Create Task'),
                  ),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: tasks.length,
            itemBuilder: (context, index) {
              final task = tasks[index].data() as Map<String, dynamic>;
              final taskId = tasks[index].id;

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  leading: _getStatusIcon(task['status']),
                  title: Text(task['title'] ?? 'Untitled Task'),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 4),
                      Text(
                        task['instructionsPlaintext']?.toString().substring(0, 60) ?? 'No instructions',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          _StatusBadge(status: task['status']),
                          const SizedBox(width: 8),
                          if (task['lastRunStatus'] != null)
                            _RunStatusBadge(status: task['lastRunStatus']),
                        ],
                      ),
                    ],
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => TaskDetailScreen(taskId: taskId),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _createNewTask(context, userId),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _getStatusIcon(String? status) {
    switch (status) {
      case 'CERTIFIED':
        return const Icon(Icons.verified, color: Colors.green);
      case 'QUARANTINED':
        return const Icon(Icons.warning, color: Colors.red);
      default:
        return const Icon(Icons.draft, color: Colors.grey);
    }
  }

  Future<void> _createNewTask(BuildContext context, String userId) async {
    final titleController = TextEditingController();
    final instructionsController = TextEditingController();

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create New Task'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                decoration: const InputDecoration(
                  labelText: 'Task Title',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: instructionsController,
                decoration: const InputDecoration(
                  labelText: 'Instructions (plain text)',
                  border: OutlineInputBorder(),
                  hintText: 'e.g., Go to example.com and check for "Welcome"',
                ),
                maxLines: 5,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (titleController.text.isEmpty) return;

              await FirebaseFirestore.instance.collection('tasks').add({
                'ownerUserId': userId,
                'title': titleController.text,
                'instructionsPlaintext': instructionsController.text,
                'status': 'DRAFT',
                'consecutiveSuccessCount': 0,
                'consecutiveFailureCount': 0,
                'createdAt': DateTime.now().millisecondsSinceEpoch,
                'updatedAt': DateTime.now().millisecondsSinceEpoch,
              });

              if (context.mounted) {
                Navigator.pop(context);
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String? status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'CERTIFIED':
        color = Colors.green;
        break;
      case 'QUARANTINED':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color),
      ),
      child: Text(
        status ?? 'DRAFT',
        style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _RunStatusBadge extends StatelessWidget {
  final String? status;

  const _RunStatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'SUCCESS':
        color = Colors.green;
        break;
      case 'FAIL':
        color = Colors.red;
        break;
      case 'BLOCKED':
        color = Colors.orange;
        break;
      case 'TIMEOUT':
        color = Colors.purple;
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'Last: ${status ?? 'UNKNOWN'}',
        style: TextStyle(fontSize: 10, color: color),
      ),
    );
  }
}
