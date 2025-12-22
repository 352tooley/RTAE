import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'run_detail_screen.dart';

class TaskDetailScreen extends StatefulWidget {
  final String taskId;

  const TaskDetailScreen({super.key, required this.taskId});

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _titleController = TextEditingController();
  final _instructionsController = TextEditingController();
  bool _isCompiling = false;
  bool _isEnqueuing = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _titleController.dispose();
    _instructionsController.dispose();
    super.dispose();
  }

  Future<void> _compileTask(Map<String, dynamic> task) async {
    setState(() => _isCompiling = true);

    try {
      final result = await FirebaseFunctions.instance
          .httpsCallable('compileTaskPlan')
          .call({'instructionsPlaintext': task['instructionsPlaintext']});

      final compiledPlanJson = result.data['compiledPlanJson'];
      final suggestedValidationSpec = result.data['suggestedValidationSpec'];

      await FirebaseFirestore.instance.collection('tasks').doc(widget.taskId).update({
        'compiledPlanJson': compiledPlanJson,
        'validationSpec': suggestedValidationSpec,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Task compiled successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Compilation failed: $e')),
        );
      }
    } finally {
      setState(() => _isCompiling = false);
    }
  }

  Future<void> _runNow(Map<String, dynamic> task) async {
    if (task['compiledPlanJson'] == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please compile the task first')),
      );
      return;
    }

    // Get first active device
    final userId = Provider.of<AuthService>(context, listen: false).userId!;
    final devicesSnapshot = await FirebaseFirestore.instance
        .collection('devices')
        .where('ownerUserId', isEqualTo: userId)
        .where('status', isEqualTo: 'ACTIVE')
        .limit(1)
        .get();

    if (devicesSnapshot.docs.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active devices found. Please pair a device first.')),
        );
      }
      return;
    }

    final deviceId = devicesSnapshot.docs.first.id;

    setState(() => _isEnqueuing = true);

    try {
      await FirebaseFunctions.instance.httpsCallable('enqueueJob').call({
        'taskId': widget.taskId,
        'deviceId': deviceId,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Job enqueued successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to enqueue job: $e')),
        );
      }
    } finally {
      setState(() => _isEnqueuing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Task Detail'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Details'),
            Tab(text: 'Schedule'),
            Tab(text: 'Runs'),
          ],
        ),
      ),
      body: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance.collection('tasks').doc(widget.taskId).snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final task = snapshot.data!.data() as Map<String, dynamic>;

          _titleController.text = task['title'] ?? '';
          _instructionsController.text = task['instructionsPlaintext'] ?? '';

          return TabBarView(
            controller: _tabController,
            children: [
              _buildDetailsTab(task),
              _buildScheduleTab(task),
              _buildRunsTab(task),
            ],
          );
        },
      ),
    );
  }

  Widget _buildDetailsTab(Map<String, dynamic> task) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _StatusBadge(status: task['status']),
              const SizedBox(width: 8),
              Text('Success: ${task['consecutiveSuccessCount'] ?? 0}/3'),
              const SizedBox(width: 16),
              Text('Failures: ${task['consecutiveFailureCount'] ?? 0}/2'),
            ],
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(
              labelText: 'Title',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) async {
              await FirebaseFirestore.instance.collection('tasks').doc(widget.taskId).update({
                'title': value,
                'updatedAt': DateTime.now().millisecondsSinceEpoch,
              });
            },
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _instructionsController,
            decoration: const InputDecoration(
              labelText: 'Instructions (plain text)',
              border: OutlineInputBorder(),
            ),
            maxLines: 5,
            onChanged: (value) async {
              await FirebaseFirestore.instance.collection('tasks').doc(widget.taskId).update({
                'instructionsPlaintext': value,
                'updatedAt': DateTime.now().millisecondsSinceEpoch,
              });
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isCompiling ? null : () => _compileTask(task),
                  icon: _isCompiling
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.build),
                  label: const Text('Compile'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _isEnqueuing ? null : () => _runNow(task),
                  icon: _isEnqueuing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.play_arrow),
                  label: const Text('Run Now'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (task['compiledPlanJson'] != null) ...[
            const Text('Compiled Plan', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Steps: ${(task['compiledPlanJson']['steps'] as List).length}'),
                    Text('Max Duration: ${task['compiledPlanJson']['maxDurationSeconds']}s'),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          if (task['validationSpec'] != null) ...[
            const Text('Validation Spec', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((task['validationSpec']['requiredSelectors'] as List?)?.isNotEmpty ?? false)
                      Text('Required Selectors: ${(task['validationSpec']['requiredSelectors'] as List).join(", ")}'),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildScheduleTab(Map<String, dynamic> task) {
    final userId = Provider.of<AuthService>(context).userId!;
    final isCertified = task['status'] == 'CERTIFIED';

    return Column(
      children: [
        if (!isCertified)
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.orange.shade100,
            child: Row(
              children: const [
                Icon(Icons.info, color: Colors.orange),
                SizedBox(width: 8),
                Expanded(
                  child: Text('Task must be CERTIFIED to add schedules (3 consecutive successful runs)'),
                ),
              ],
            ),
          ),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance
                .collection('schedules')
                .where('taskId', isEqualTo: widget.taskId)
                .snapshots(),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(child: Text('Error: ${snapshot.error}'));
              }

              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }

              final schedules = snapshot.data!.docs;

              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: schedules.length + 1,
                itemBuilder: (context, index) {
                  if (index == schedules.length) {
                    return ElevatedButton.icon(
                      onPressed: isCertified ? () => _addSchedule(userId) : null,
                      icon: const Icon(Icons.add),
                      label: const Text('Add Schedule'),
                    );
                  }

                  final schedule = schedules[index].data() as Map<String, dynamic>;
                  final scheduleId = schedules[index].id;

                  return Card(
                    child: ListTile(
                      leading: Icon(
                        schedule['enabled'] ? Icons.schedule : Icons.schedule_outlined,
                        color: schedule['enabled'] ? Colors.green : Colors.grey,
                      ),
                      title: Text(schedule['cronExpression'] ?? 'Unknown'),
                      subtitle: Text('Enabled: ${schedule['enabled']}'),
                      trailing: Switch(
                        value: schedule['enabled'],
                        onChanged: isCertified
                            ? (value) async {
                                await FirebaseFirestore.instance
                                    .collection('schedules')
                                    .doc(scheduleId)
                                    .update({'enabled': value});
                              }
                            : null,
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildRunsTab(Map<String, dynamic> task) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('runs')
          .where('taskId', isEqualTo: widget.taskId)
          .orderBy('startedAt', descending: true)
          .limit(50)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('Error: ${snapshot.error}'));
        }

        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final runs = snapshot.data!.docs;

        if (runs.isEmpty) {
          return const Center(child: Text('No runs yet'));
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: runs.length,
          itemBuilder: (context, index) {
            final run = runs[index].data() as Map<String, dynamic>;
            final runId = runs[index].id;

            return Card(
              child: ListTile(
                leading: _getRunStatusIcon(run['status']),
                title: Text(run['summaryText'] ?? 'No summary'),
                subtitle: Text(_formatTimestamp(run['startedAt'])),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => RunDetailScreen(runId: runId),
                    ),
                  );
                },
              ),
            );
          },
        );
      },
    );
  }

  Widget _getRunStatusIcon(String? status) {
    switch (status) {
      case 'SUCCESS':
        return const Icon(Icons.check_circle, color: Colors.green);
      case 'FAIL':
        return const Icon(Icons.error, color: Colors.red);
      case 'BLOCKED':
        return const Icon(Icons.block, color: Colors.orange);
      case 'TIMEOUT':
        return const Icon(Icons.timer_off, color: Colors.purple);
      default:
        return const Icon(Icons.help, color: Colors.grey);
    }
  }

  String _formatTimestamp(int? timestamp) {
    if (timestamp == null) return 'Unknown';
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _addSchedule(String userId) async {
    final cronController = TextEditingController(text: '0 9 * * MON-FRI');

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Schedule'),
        content: TextField(
          controller: cronController,
          decoration: const InputDecoration(
            labelText: 'Cron Expression',
            border: OutlineInputBorder(),
            hintText: '0 9 * * MON-FRI',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              await FirebaseFirestore.instance.collection('schedules').add({
                'taskId': widget.taskId,
                'ownerUserId': userId,
                'cronExpression': cronController.text,
                'enabled': true,
                'nextRunAt': DateTime.now().add(const Duration(days: 1)).millisecondsSinceEpoch,
                'createdAt': DateTime.now().millisecondsSinceEpoch,
                'updatedAt': DateTime.now().millisecondsSinceEpoch,
              });

              if (context.mounted) {
                Navigator.pop(context);
              }
            },
            child: const Text('Add'),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Text(
        status ?? 'DRAFT',
        style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.bold),
      ),
    );
  }
}
