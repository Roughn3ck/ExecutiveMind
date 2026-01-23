<?php
// You can comment out or remove these lines once everything is working.
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Import PHPMailer classes into the global namespace
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// The require paths assume you have a 'PHPMailer/' directory alongside this script.
require 'PHPMailer/src/Exception.php';
require 'PHPMailer/src/PHPMailer.php';
require 'PHPMailer/src/SMTP.php';

// --- Configuration ---
$email_server = "mail.executivemind.io";
$smtp_port = 465;
$sender_email = "agent@executivemind.io"; // This is the account that sends the email
$sender_password = "3x3cut1veM1nd";
$recipient_email = "agent@executivemind.io"; // The email is sent TO the agent's inbox

header('Content-Type: application/json');

// Get the POST data from the JavaScript fetch
$data = json_decode(file_get_contents('php://input'), true);

// Basic validation
if (empty($data['name']) || empty($data['email']) || !filter_var($data['email'], FILTER_VALIDATE_EMAIL) || empty($data['message'])) {
    echo json_encode(['success' => false, 'message' => 'Invalid input. Please fill out all fields correctly.']);
    exit;
}

$name = $data['name'];
$email = $data['email'];
$message_body = $data['message'];

// --- Create the email that will be sent to the agent's inbox ---
$subject = "Website Inquiry from " . $name;
// This body format matches what the Python agent expects to parse
$body = "Name: " . $name . "\n" .
        "Email: " . $email . "\n\n" .
        "Message:\n" . $message_body;

// Create an instance of PHPMailer
$mail = new PHPMailer(true);

try {
    // --- Server settings ---
    // $mail->SMTPDebug = SMTP::DEBUG_SERVER; // Enable verbose debug output for troubleshooting
    $mail->isSMTP();
    $mail->Host       = $email_server;
    $mail->SMTPAuth   = true;
    $mail->Username   = $sender_email;
    $mail->Password   = $sender_password;
    
    // --- THIS IS THE FIX ---
    // Use the string 'ssl' which is compatible with all PHPMailer versions.
    $mail->SMTPSecure = 'ssl';
    
    $mail->Port       = $smtp_port;

    // --- Recipients ---
    $mail->setFrom($sender_email, 'Executive Mind Website'); // "From" address
    $mail->addAddress($recipient_email);                     // "To" address
    $mail->addReplyTo($email, $name);                        // Set the "Reply-To" to the user's email

    // --- Content ---
    $mail->isHTML(false); // Set email format to plain text
    $mail->Subject = $subject;
    $mail->Body    = $body;

    $mail->send();
    echo json_encode(['success' => true, 'message' => 'Message has been sent']);

} catch (Exception $e) {
    // Return a JSON error message
    echo json_encode(['success' => false, 'message' => "Message could not be sent. Mailer Error: {$mail->ErrorInfo}"]);
}
?>