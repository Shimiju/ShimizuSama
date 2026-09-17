import Tesseract from 'tesseract.js';
import { logger } from '../../utils/logger.js';

export class OCRScanner {
  /**
   * Scans an image URL and extracts text using Tesseract.js OCR.
   * Runs asynchronously and cleans up after use.
   */
  public static async scanImage(url: string): Promise<string> {
    try {
      const result = await Tesseract.recognize(url, 'eng');
      return result.data.text;
    } catch (err) {
      logger.error({ err, url }, 'Failed to extract text via OCR');
      return '';
    }
  }
}
