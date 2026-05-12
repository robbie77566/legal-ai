import { Document, Packer, Paragraph, TextRun } from 'docx'

export class ExportService {
  /**
   * Generates a court-ready DOCX file from the reviewed legal analysis.
   */
  static async generateDocx(analysis: any): Promise<Buffer> {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Article 11.07 Writ of Habeas Corpus',
                  bold: true,
                  size: 28,
                }),
              ],
            }),
            new Paragraph({
              text: analysis.content || 'Analysis goes here...',
            }),
          ],
        },
      ],
    })

    return await Packer.toBuffer(doc)
  }
}
