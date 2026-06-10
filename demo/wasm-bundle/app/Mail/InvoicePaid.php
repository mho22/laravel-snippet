<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvoicePaid extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public mixed $invoice = null) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Invoice Paid');
    }

    public function content(): Content
    {
        return new Content(htmlString: '<p>Invoice paid.</p>');
    }

    public function attachments(): array
    {
        return [];
    }
}
