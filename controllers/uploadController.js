const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

/**
 * POST /api/upload
 * Upload a single image or file to Cloudinary.
 * Expects multipart/form-data with field name "file".
 * Returns { url, publicId, fileType, fileName, fileSize }
 */
const uploadFile = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file provided." });
        }

        // Logging for debugging (will show up in Render logs)
        console.log(`📤 Starting upload: ${req.file.originalname} (${req.file.mimetype})`);

        // Check if Cloudinary is configured
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
            console.error("Cloudinary error: Missing credentials in environment variables.");
            return res.status(500).json({
                success: false,
                message: "Cloudinary is not configured on the server. Please check environment variables.",
            });
        }

        const { mimetype, originalname, size, buffer } = req.file;

        // Determine resource_type for Cloudinary
        let resourceType = "raw";
        let fileType = "file";

        if (mimetype.startsWith("image/")) {
            resourceType = "image";
            fileType = "image";
        } else if (mimetype.startsWith("video/")) {
            resourceType = "video";
            fileType = "video";
        }

        // Stream buffer directly to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "chat-files",
                    resource_type: resourceType,
                    use_filename: true,
                    unique_filename: true,
                },
                (error, result) => {
                    if (error) {
                        console.error("❌ Cloudinary upload_stream error:", error);
                        return reject(error);
                    }
                    resolve(result);
                }
            );
            streamifier.createReadStream(buffer).pipe(uploadStream);
        });

        console.log(`✅ Upload successful: ${uploadResult.secure_url}`);

        return res.status(200).json({
            success: true,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            fileType,
            fileName: originalname,
            fileSize: size,
        });
    } catch (error) {
        console.error("uploadFile controller error:", error.message);
        next(error);
    }
};

module.exports = { uploadFile };
