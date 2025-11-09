import PouchDB from 'pouchdb';

/**
 * Backup service for storing previous versions of documents before overwriting
 */

const BACKUP_DB_NAME = 'packing-app-backups';
const MAX_BACKUPS_PER_DOCUMENT = 5;

export interface BackupDocument {
  _id: string;
  _rev?: string;
  originalDocId: string;
  docType: 'question-set' | 'packing-list';
  data: any;
  backedUpAt: string;
  reason: string; // e.g., "pod-sync-overwrite", "manual-backup"
}

class BackupService {
  private db: PouchDB.Database<BackupDocument>;

  constructor() {
    this.db = new PouchDB<BackupDocument>(BACKUP_DB_NAME);
  }

  /**
   * Create a backup of a document before overwriting it
   */
  async createBackup(
    originalDocId: string,
    docType: 'question-set' | 'packing-list',
    data: any,
    reason: string
  ): Promise<void> {
    try {
      const backupDoc: BackupDocument = {
        _id: `${originalDocId}:${new Date().toISOString()}`,
        originalDocId,
        docType,
        data,
        backedUpAt: new Date().toISOString(),
        reason,
      };

      await this.db.put(backupDoc);

      // Clean up old backups if we exceed the max
      await this.cleanupOldBackups(originalDocId);
    } catch (error) {
      console.error('Failed to create backup:', error);
      // Don't throw - backup failure shouldn't block the main operation
    }
  }

  /**
   * Get all backups for a specific document
   */
  async getBackupsForDocument(originalDocId: string): Promise<BackupDocument[]> {
    try {
      const result = await this.db.allDocs({
        include_docs: true,
        startkey: `${originalDocId}:`,
        endkey: `${originalDocId}:\ufff0`,
      });

      return result.rows
        .map(row => row.doc!)
        .sort((a, b) => new Date(b.backedUpAt).getTime() - new Date(a.backedUpAt).getTime());
    } catch (error) {
      console.error('Failed to get backups:', error);
      return [];
    }
  }

  /**
   * Restore a document from a backup
   */
  async restoreBackup(backupId: string): Promise<any> {
    try {
      const backup = await this.db.get(backupId);
      return backup.data;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw error;
    }
  }

  /**
   * Clean up old backups, keeping only the most recent MAX_BACKUPS_PER_DOCUMENT
   */
  private async cleanupOldBackups(originalDocId: string): Promise<void> {
    try {
      const backups = await this.getBackupsForDocument(originalDocId);

      if (backups.length > MAX_BACKUPS_PER_DOCUMENT) {
        const backupsToDelete = backups.slice(MAX_BACKUPS_PER_DOCUMENT);

        for (const backup of backupsToDelete) {
          try {
            if (backup._id && backup._rev) {
              await this.db.remove(backup._id, backup._rev);
            }
          } catch (error) {
            console.error('Failed to delete old backup:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Delete all backups for a specific document
   */
  async deleteBackupsForDocument(originalDocId: string): Promise<void> {
    try {
      const backups = await this.getBackupsForDocument(originalDocId);

      for (const backup of backups) {
        try {
          if (backup._id && backup._rev) {
            await this.db.remove(backup._id, backup._rev);
          }
        } catch (error) {
          console.error('Failed to delete backup:', error);
        }
      }
    } catch (error) {
      console.error('Failed to delete backups:', error);
      throw error;
    }
  }

  /**
   * Get all backups across all documents
   */
  async getAllBackups(): Promise<BackupDocument[]> {
    try {
      const result = await this.db.allDocs({
        include_docs: true,
      });

      return result.rows
        .map(row => row.doc!)
        .sort((a, b) => new Date(b.backedUpAt).getTime() - new Date(a.backedUpAt).getTime());
    } catch (error) {
      console.error('Failed to get all backups:', error);
      return [];
    }
  }

  /**
   * Get database info
   */
  async getInfo(): Promise<any> {
    return this.db.info();
  }
}

// Export a singleton instance
export const backupService = new BackupService();
