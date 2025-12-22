import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../services/auth_service.dart';

class DevicesScreen extends StatelessWidget {
  const DevicesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authService = Provider.of<AuthService>(context);
    final userId = authService.userId!;

    return Scaffold(
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('devices')
            .where('ownerUserId', isEqualTo: userId)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final devices = snapshot.data?.docs ?? [];

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton.icon(
                  onPressed: () => _generatePairingCode(context),
                  icon: const Icon(Icons.add),
                  label: const Text('Generate Pairing Code'),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(double.infinity, 48),
                  ),
                ),
              ),
              Expanded(
                child: devices.isEmpty
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.devices, size: 64, color: Colors.grey),
                            SizedBox(height: 16),
                            Text('No devices paired yet', style: TextStyle(fontSize: 18, color: Colors.grey)),
                            SizedBox(height: 8),
                            Text('Generate a pairing code to connect your Windows agent', style: TextStyle(color: Colors.grey)),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: devices.length,
                        itemBuilder: (context, index) {
                          final device = devices[index].data() as Map<String, dynamic>;
                          final deviceId = devices[index].id;

                          return Card(
                            child: ListTile(
                              leading: Icon(
                                Icons.computer,
                                color: _getStatusColor(device['status']),
                                size: 40,
                              ),
                              title: Text(device['displayName'] ?? 'Unknown Device'),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text('Status: ${device['status'] ?? 'UNKNOWN'}'),
                                  Text('Last seen: ${_formatTimestamp(device['lastSeenAt'])}'),
                                  Text('Device ID: ${deviceId.substring(0, 8)}...'),
                                ],
                              ),
                              isThreeLine: true,
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Color _getStatusColor(String? status) {
    switch (status) {
      case 'ACTIVE':
        return Colors.green;
      case 'OFFLINE':
        return Colors.grey;
      case 'QUARANTINED':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _formatTimestamp(int? timestamp) {
    if (timestamp == null) return 'Never';
    final now = DateTime.now();
    final date = DateTime.fromMillisecondsSinceEpoch(timestamp);
    final diff = now.difference(date);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  Future<void> _generatePairingCode(BuildContext context) async {
    final displayNameController = TextEditingController(text: 'Windows Agent');

    await showDialog(
      context: context,
      builder: (context) => _PairingCodeDialog(displayNameController: displayNameController),
    );
  }
}

class _PairingCodeDialog extends StatefulWidget {
  final TextEditingController displayNameController;

  const _PairingCodeDialog({required this.displayNameController});

  @override
  State<_PairingCodeDialog> createState() => _PairingCodeDialogState();
}

class _PairingCodeDialogState extends State<_PairingCodeDialog> {
  bool _isGenerating = false;
  String? _pairingCode;
  int? _expiresAt;

  @override
  void initState() {
    super.initState();
    _generateCode();
  }

  Future<void> _generateCode() async {
    setState(() => _isGenerating = true);

    try {
      final result = await FirebaseFunctions.instance.httpsCallable('createPairingCode').call({
        'displayName': widget.displayNameController.text,
      });

      setState(() {
        _pairingCode = result.data['code'];
        _expiresAt = result.data['expiresAt'];
        _isGenerating = false;
      });
    } catch (e) {
      setState(() => _isGenerating = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to generate pairing code: $e')),
        );
        Navigator.pop(context);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Pairing Code'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: widget.displayNameController,
            decoration: const InputDecoration(
              labelText: 'Device Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),
          if (_isGenerating)
            const CircularProgressIndicator()
          else if (_pairingCode != null) ...[
            const Text('Enter this code on your Windows agent:', style: TextStyle(fontSize: 14)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue, width: 2),
              ),
              child: SelectableText(
                _pairingCode!,
                style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold, letterSpacing: 4),
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: _pairingCode!));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Code copied to clipboard')),
                );
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy Code'),
            ),
            const SizedBox(height: 8),
            Text(
              'Expires in ${_getRemainingTime()}',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }

  String _getRemainingTime() {
    if (_expiresAt == null) return 'unknown';
    final remaining = Duration(milliseconds: _expiresAt! - DateTime.now().millisecondsSinceEpoch);
    return '${remaining.inMinutes}:${(remaining.inSeconds % 60).toString().padLeft(2, '0')}';
  }
}
